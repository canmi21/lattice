<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { afterNavigate, goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import House from '@lucide/svelte/icons/house';
	import Link from '@lucide/svelte/icons/link';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import { edgeReveal } from '@canmi/behavior/edge';
	import { reader } from '@canmi/behavior/state';
	import { resizeHandle } from '@canmi/behavior/resize';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { border, duration, easing, radius } from '@canmi/tokens/vocabulary.stylex';
	import { onMount, tick, type Component } from 'svelte';
	import { EDGE_MARGINS, provideChrome } from '$lib/chrome.svelte.ts';
	import { createDraft, DRAFTS, splitPath, type Draft } from '$lib/collection.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import { foldHeight } from '$lib/fold.ts';
	import { arriving, leaving, Movement } from '$lib/movement.ts';
	import {
		FOLD_BELOW,
		FOLDED_ATTRIBUTE,
		FOLDED_KEY,
		SIDEBAR,
		sidebarStyles,
	} from '$lib/sidebar.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** What a page floats over the pane: a toolbar at its foot, a drawer at its right. */
	const chrome = provideChrome();

	type Section = { label: string; href: string; icon: Component };

	/**
	 * The sections above the articles. Overview first; the three after it are the site's own
	 * business -- who read it, who linked to it, what readers said -- and are placed before what
	 * they show is designed. See spec/architecture/local.md.
	 */
	const SECTIONS: Section[] = [
		{ label: 'Overview', href: '/', icon: House },
		{ label: 'Traffic', href: '/traffic', icon: ChartLine },
		{ label: 'References', href: '/references', icon: Link },
		{ label: 'Comments', href: '/comments', icon: MessageSquare },
	];

	const SETTINGS: Section = { label: 'Settings', href: '/settings', icon: Settings };

	/**
	 * Every article, draft or published: the draft row outlives publication and is the working
	 * copy from then on, so the draft rows are the whole set. Loaded with the page, and again
	 * whenever something that writes them says so. See spec/todo/milestones.md.
	 */
	const articles = $derived(data.articles);
	let open = $state(true);

	/** Categories the writer closed; each is open until then. */
	const closed = new SvelteSet<string>();

	/** The articles with no category, and a folder per category in name order. */
	const groups = $derived.by(() => {
		const folders = new Map<string, Draft[]>();
		const loose: Draft[] = [];
		for (const entry of articles) {
			const { category } = splitPath(entry.meta.path);
			if (!category) loose.push(entry);
			else folders.set(category, [...(folders.get(category) ?? []), entry]);
		}
		return { loose, folders: [...folders].toSorted(([a], [b]) => a.localeCompare(b)) };
	});

	/** The step inward per level: small, so depth reads without spending the sidebar's width on it. */
	const INDENT = ['ps-2', 'ps-4', 'ps-6'];

	async function start() {
		const { resource } = await createDraft();
		open = true;
		await invalidate(DRAFTS);
		await goto(`/draft/${resource}`);
	}

	const here = (href: string) => page.url.pathname === href;

	/** The rules that place the sidebar, rendered into the head with the page. See `$lib/sidebar.ts`. */
	const PLACEMENT = `<style>${sidebarStyles()}</style>`;

	/**
	 * Folding. The sidebar folds away when the window cannot hold both regions at their minimums,
	 * or when the writer folds it; folded, a float in the corner brings it back, and the pointer
	 * running to the window's left edge lifts it out over the pane for as long as it is wanted.
	 * See spec/architecture/local.md.
	 */
	let collapsed = $state(false);
	/** Lifted over the pane: by the pointer at the edge, or pinned by the float's button. */
	let peek = $state<'none' | 'hover' | 'pinned'>('none');
	/** Whether the window holds both regions. The server cannot know, and assumes it does. */
	let wide = $state(true);
	const folded = $derived(collapsed || !wide);

	let nav: HTMLElement;
	let float: HTMLElement;

	/** Every movement of the sidebar, one at a time. See `$lib/movement.ts`. */
	const movement = new Movement();
	const play = (keyframes: Keyframe[], pixels: number) => movement.play(nav, keyframes, pixels);
	const release = (animation: Animation | undefined) => movement.release(animation);

	/**
	 * The writer's fold, remembered: the attribute the first-frame script sets from the record is
	 * kept in step, so the rules read the same answer before hydration and after it.
	 */
	function remember(on: boolean) {
		collapsed = on;
		document.documentElement.toggleAttribute(FOLDED_ATTRIBUTE, on);
		reader.remember(localStorage, FOLDED_KEY, on);
	}

	/** Set while the sidebar is going down, so the moves that follow do not start it again. */
	let lowering = false;

	/**
	 * Dragging the divider past the sidebar's minimum. It holds there through a margin, and past
	 * it the drag is asking to fold: the sidebar says so while it is, and letting go folds it.
	 * See `Fold` in @canmi/behavior/resize.
	 */
	let folding = $state(false);
	const RESIZING = {
		...SIDEBAR,
		fold: {
			beyond: 2,
			intent: (asking: boolean) => (folding = asking),
			fold: () => void fold(),
		},
	};

	async function lift(how: 'hover' | 'pinned') {
		lowering = false;
		peek = how;
		await tick();
		const distance = nav.getBoundingClientRect().right;
		const done = await play(arriving('left', distance), distance);
		await release(done);
	}

	async function lower() {
		if (peek === 'none' || lowering) return;
		lowering = true;
		const distance = nav.getBoundingClientRect().right;
		const done = await play(leaving('left', distance), distance);
		// A lift that started meanwhile has taken over, and the sidebar stays up.
		if (!lowering) return;
		lowering = false;
		peek = 'none';
		await release(done);
	}

	/** Open or close a docked sidebar across its width, clipped while it moves. */
	function sweep(from: number, to: number) {
		return play(
			[
				{ width: `${from}px`, opacity: from ? 1 : 0, overflow: 'hidden' },
				{ width: `${to}px`, opacity: to ? 1 : 0, overflow: 'hidden' },
			],
			Math.abs(to - from),
		);
	}

	async function fold() {
		if (peek !== 'none') return lower();
		const done = await sweep(nav.getBoundingClientRect().width, 0);
		remember(true);
		await release(done);
	}

	async function unfold() {
		if (!wide) return lift('pinned');
		peek = 'none';
		remember(false);
		await tick();
		await release(await sweep(0, nav.getBoundingClientRect().width));
	}

	/** The float's one control: docked, it folds; folded, it brings the sidebar back. */
	function toggle() {
		if (!folded) return void fold();
		if (peek === 'pinned') return void lower();
		void unfold();
	}

	// The edge lifts a folded sidebar out, and moving clear of it lets it down; one pinned by the
	// float is the float's, and the edge leaves it alone. See @canmi/behavior/edge.
	const moved = edgeReveal({
		side: 'left',
		...EDGE_MARGINS,
		live: () => folded && peek !== 'pinned',
		out: () => peek === 'hover',
		panel: () => nav,
		reveal: () => void lift('hover'),
		conceal: () => void lower(),
	});

	function pressed(event: PointerEvent) {
		const target = event.target as Node;
		if (peek === 'pinned' && !nav.contains(target) && !float.contains(target)) void lower();
	}

	function key(event: KeyboardEvent) {
		if (event.key === 'Escape' && peek !== 'none') void lower();
	}

	onMount(() => {
		collapsed = reader.recall(localStorage, FOLDED_KEY, false);
		const narrow = window.matchMedia(`(max-width: ${FOLD_BELOW}rem)`);
		const measure = () => (wide = !narrow.matches);
		measure();
		narrow.addEventListener('change', measure);
		return () => narrow.removeEventListener('change', measure);
	});

	// A window widened past the fold docks the sidebar, so a lifted one has nothing left to float over.
	$effect(() => {
		if (!folded && peek !== 'none') {
			movement.cancel();
			lowering = false;
			peek = 'none';
		}
	});

	// Choosing somewhere to go is what a lifted sidebar was for.
	afterNavigate(() => void lower());

	const LINE =
		'linear-gradient(to right, transparent calc(50% - 1px), var(--color-border-strong) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px))';

	// The page is laid out as a ground with the content pane set on it: the section column is the
	// ground itself, and the pane is the site's own page color with a corner, so what is being
	// written sits on exactly the ground a reader sees it on. See spec/architecture/local.md.
	const styles = stylex.create({
		pane: { borderRadius: radius.xl },
		// A section is a pill on the ground rather than a word in a list, so its corner is the
		// buttons' rather than the compact control's.
		item: { borderRadius: radius.md },
		// The section being worked in takes the pane's ground, which is what says the pane is its.
		current: {
			color: 'var(--color-text-strong)',
			backgroundColor: 'var(--color-page)',
		},
		unnamed: { color: 'var(--color-text-soft)' },
		// What the sidebar holds recedes while a drag is asking to fold it, and the notice stands
		// in front: what letting go will do, said on the region it will happen to.
		receded: { opacity: 0.25 },
		notice: {
			color: 'var(--color-text-strong)',
			backgroundColor: 'var(--color-page)',
			borderRadius: radius.lg,
			borderWidth: border.hairlinePx,
			borderStyle: 'dashed',
			borderColor: 'var(--color-border-strong)',
		},
		// The divider draws nothing at rest; a line appears down its middle while it is pointed at,
		// held or focused, which is the only time it is anything but the gap between two regions.
		handle: {
			backgroundImage: {
				default: 'none',
				':hover': LINE,
				':active': LINE,
				':focus-visible': LINE,
			},
			outlineStyle: { default: null, ':focus-visible': 'none' },
		},
		float: {
			backgroundColor: 'var(--color-paper-hover)',
			borderRadius: radius.lg,
			boxShadow: '0 0.25rem 1rem oklch(0 0 0 / 0.14), 0 0 0 1px var(--color-border)',
		},
		chevron: {
			transitionProperty: 'rotate',
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
	});

	const ITEM = 'flex min-w-0 items-center gap-2 px-2 py-1.5 no-underline';
	// The article tree is denser than the sections above it: it is a long list read by scanning,
	// where the sections are a handful of places to go.
	const TREE_ITEM = 'flex min-w-0 items-center gap-2 px-2 py-1 no-underline';
</script>

{#snippet chevron(shown: boolean)}
	<ChevronRight
		class="size-3.5 {shown ? 'rotate-90' : ''} {stylex.attrs(styles.chevron).class}"
		aria-hidden="true"
	/>
{/snippet}

{#snippet article(entry: Draft, depth: number)}
	{@const href = `/draft/${entry.resource}`}
	{@const current = page.url.pathname === href}
	<li>
		<a
			{href}
			aria-current={current ? 'page' : undefined}
			title={entry.meta.title ?? 'Untitled'}
			class="{TREE_ITEM} {INDENT[depth]} {stylex.attrs(
				surfaces.quietControl,
				surfaces.uiText,
				styles.item,
				current && styles.current,
			).class}"
		>
			<FileText class="size-4 shrink-0" aria-hidden="true" />
			<span class="truncate {stylex.attrs(!entry.meta.title && styles.unnamed).class}"
				>{entry.meta.title ?? 'Untitled'}</span
			>
		</a>
	</li>
{/snippet}

{#snippet entry(section: Section)}
	{@const current = here(section.href)}
	<a
		href={section.href}
		aria-current={current ? 'page' : undefined}
		class="{ITEM} {stylex.attrs(
			surfaces.quietControl,
			surfaces.uiText,
			styles.item,
			current && styles.current,
		).class}"
	>
		<section.icon class="size-4 shrink-0" aria-hidden="true" />
		<span class="truncate">{section.label}</span>
	</a>
{/snippet}

<svelte:document onpointermove={moved} onpointerdown={pressed} onkeydown={key} />

<svelte:head>
	<!-- Built from the sidebar's constants, which a stylesheet cannot read. Raw, and stated rather
	     than suppressed, for the reason the root layout gives. -->
	{@html PLACEMENT}
</svelte:head>

<div
	data-ground
	data-collapsed={collapsed || undefined}
	data-peek={peek !== 'none' || undefined}
	class="flex h-dvh overflow-hidden p-2"
>
	<!-- The width is the divider's property, set before the first frame when one is remembered, and
	     placed by the rules in the head: docked, folded away, or lifted over the pane. -->
	<nav data-sidebar bind:this={nav} class="relative flex shrink-0 flex-col gap-1 px-1 py-2">
		{#if folding}
			<div
				class="pointer-events-none absolute inset-1 z-10 flex flex-col items-center justify-center gap-2 text-center {stylex.attrs(
					surfaces.uiText,
					styles.notice,
				).class}"
			>
				<PanelLeftClose class="size-5" aria-hidden="true" />
				<span>Release to fold</span>
			</div>
		{/if}
		<div
			class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] {stylex.attrs(
				folding && styles.receded,
			).class}"
		>
			{#each SECTIONS as section (section.href)}
				{@render entry(section)}
			{/each}

			<!-- Articles, a folder of every article, and inside it a folder per category. The depth is
			     said by a small step inward rather than a full one per level, so a deep list does not
			     run out of width. Only Articles carries a chevron, at the row's end beside the control
			     that creates one; a category says it is open by its folder icon alone. -->
			<div class="mt-3 flex items-center">
				<button
					type="button"
					aria-expanded={open}
					onclick={() => (open = !open)}
					class="{ITEM} flex-1 cursor-pointer text-left {stylex.attrs(
						surfaces.quietControl,
						surfaces.uiText,
						styles.item,
					).class}"
				>
					{#if open}
						<FolderOpen class="size-4 shrink-0" aria-hidden="true" />
					{:else}
						<Folder class="size-4 shrink-0" aria-hidden="true" />
					{/if}
					<span class="truncate">Articles</span>
				</button>
				<button
					type="button"
					aria-label="New article"
					onclick={start}
					class="cursor-pointer p-1.5 {stylex.attrs(surfaces.quietControl, styles.item).class}"
				>
					<Plus class="size-3.5" aria-hidden="true" />
				</button>
				<button
					type="button"
					tabindex="-1"
					aria-hidden="true"
					onclick={() => (open = !open)}
					class="cursor-pointer px-2 py-1.5 {stylex.attrs(surfaces.quietControl, styles.item)
						.class}"
				>
					{@render chevron(open)}
				</button>
			</div>

			<!-- Folded by its height, not removed: see $lib/fold.ts. -->
			<div use:foldHeight={open} class="shrink-0 overflow-hidden">
				<ul class="flex flex-col">
					{#each groups.loose as entry (entry.resource)}
						{@render article(entry, 1)}
					{/each}
					{#each groups.folders as [category, entries] (category)}
						{@const shown = !closed.has(category)}
						<li>
							<button
								type="button"
								aria-expanded={shown}
								onclick={() => (shown ? closed.add(category) : closed.delete(category))}
								class="{TREE_ITEM} {INDENT[1]} w-full cursor-pointer text-left {stylex.attrs(
									surfaces.quietControl,
									surfaces.uiText,
									styles.item,
								).class}"
							>
								{#if shown}
									<FolderOpen class="size-4 shrink-0" aria-hidden="true" />
								{:else}
									<Folder class="size-4 shrink-0" aria-hidden="true" />
								{/if}
								<span class="truncate">{category}</span>
							</button>
							<div use:foldHeight={shown} class="overflow-hidden">
								<ul class="flex flex-col">
									{#each entries as entry (entry.resource)}
										{@render article(entry, 2)}
									{/each}
								</ul>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</div>

		<div class="pt-2 {stylex.attrs(folding && styles.receded).class}">
			{@render entry(SETTINGS)}
		</div>
	</nav>

	<!-- The gap between the two regions is the divider: drag it, step it with the arrow keys, or
	     double-click it to go back to the fallback. See @canmi/behavior/resize. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (a focusable separator with a value is a widget
	     in ARIA -- the arrow keys move it -- and the rule reads the role as static) -->
	<div
		role="separator"
		aria-orientation="vertical"
		aria-label="Resize the sidebar"
		tabindex="0"
		data-divider
		use:resizeHandle={RESIZING}
		class="w-2 shrink-0 cursor-col-resize touch-none {stylex.attrs(styles.handle).class}"
	></div>

	<!-- The pane, and the float held over its corner. The float sits outside the element that
	     scrolls so the text moves under it and it does not move with the text. -->
	<div class="relative flex min-h-0 min-w-0 flex-1">
		<!-- The pane is the one thing that scrolls. The ground holds still around it, so the sections
		     and the pane's corners stay where they are while the text moves, and a sticky bar inside
		     sticks to the pane's top edge. A page that wants a measure sets its own. -->
		<div
			class="min-h-0 min-w-0 flex-1 overflow-y-auto px-8 pt-16 pb-32 {stylex.attrs(
				surfaces.page,
				styles.pane,
			).class}"
		>
			{@render children()}
		</div>

		<!-- Always at the pane's top-left, docked or folded: the one control that folds and unfolds
		     the sidebar, and the search, which is a place held for a feature not built yet. -->
		<div
			bind:this={float}
			class="absolute top-2 left-2 z-20 flex items-center gap-0.5 p-1 {stylex.attrs(styles.float)
				.class}"
		>
			<button
				type="button"
				aria-label={folded ? 'Show the sidebar' : 'Fold the sidebar'}
				aria-expanded={!folded || peek !== 'none'}
				onclick={toggle}
				class="cursor-pointer p-1.5 {stylex.attrs(surfaces.quietControl, styles.item).class}"
			>
				{#if folded}
					<PanelLeftOpen class="size-4" aria-hidden="true" />
				{:else}
					<PanelLeftClose class="size-4" aria-hidden="true" />
				{/if}
			</button>
			<button
				type="button"
				aria-label="Search"
				class="cursor-pointer p-1.5 {stylex.attrs(surfaces.quietControl, styles.item).class}"
			>
				<Search class="size-4" aria-hidden="true" />
			</button>
		</div>

		<!-- What the page floats over the pane: a drawer at its right, and a toolbar centred at its
		     foot and above everything else there, the drawer included. -->
		{@render chrome.drawer?.()}
		{#if chrome.toolbar}
			<div class="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center">
				<div class="pointer-events-auto">{@render chrome.toolbar()}</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* The ground the pane is set on, and held still: the document never scrolls, only the pane
	   does, so the page cannot rubber-band the ground out from under it either. `html` carries no
	   class and is what the tokens paint, so it is reached from here -- and only while this layout
	   is on the page, because a component's sheet stays loaded after it unmounts and the preview,
	   which is outside it, scrolls the document. `[data-ground]` is the address. */
	:global(html:has([data-ground])) {
		overflow: hidden;
		overscroll-behavior: none;
		background-color: var(--color-paper-hover);
	}
</style>

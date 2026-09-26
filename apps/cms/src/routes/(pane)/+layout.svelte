<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeftToLine from '@lucide/svelte/icons/arrow-left-to-line';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import House from '@lucide/svelte/icons/house';
	import Link from '@lucide/svelte/icons/link';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Settings from '@lucide/svelte/icons/settings';
	import { edgeReveal } from '@canmi/behavior/edge';
	import { reader } from '@canmi/behavior/state';
	import { resizeHandle } from '@canmi/behavior/resize';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { border, radius } from '@canmi/tokens/vocabulary.stylex';
	import { onMount, tick, type Component } from 'svelte';
	import ArticleTree from '$lib/article-tree.svelte';
	import { EDGE_MARGINS, provideChrome } from '$lib/chrome.svelte.ts';
	import ContextMenu, { SEPARATOR, type MenuItem } from '$lib/context-menu.svelte';
	import SearchGlyph from '$lib/glyphs/search.svelte';
	import SidebarHidden from '$lib/glyphs/sidebar-hidden.svelte';
	import SidebarShown from '$lib/glyphs/sidebar-shown.svelte';
	import { arriving, leaving, Movement } from '$lib/movement.ts';
	import {
		FOLD_BELOW,
		FOLDED_ATTRIBUTE,
		FOLDED_KEY,
		SIDEBAR,
		sidebarStyles,
	} from '$lib/sidebar.ts';
	import { ITEM, rows } from '$lib/sidebar-rows.ts';
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
	 * The sidebar's own menu, on the rows that have something to offer: a section, the Articles
	 * folder, a category, an article. Anywhere else a right click is the browser's -- the handler is
	 * on those rows and nowhere above them. See $lib/context-menu.svelte.
	 */
	let menu = $state<{ x: number; y: number; build: () => MenuItem[] }>();
	function offer(event: MouseEvent, build: () => MenuItem[]) {
		event.preventDefault();
		event.stopPropagation();
		menu = { x: event.clientX, y: event.clientY, build };
	}

	const copy = (text: string) => navigator.clipboard.writeText(text);
	const newTab = (href: string) => void window.open(href, '_blank');

	function sectionMenu(section: Section): MenuItem[] {
		return [
			{ label: 'Open', icon: section.icon, run: () => goto(section.href) },
			{ label: 'Open in new tab', icon: ExternalLink, run: () => newTab(section.href) },
			SEPARATOR,
			{
				label: 'Copy link',
				icon: Link,
				run: () => copy(new URL(section.href, location.origin).href),
			},
		];
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
	let divider = $state<HTMLElement>();
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
	//
	// The closed end is the folded layout exactly, or the last frame jumps: the sidebar's padding
	// goes to nothing with its width -- a border-box cannot be narrower than its padding, so a
	// width of zero alone stopped at 8px -- and a negative margin takes up the divider, which is
	// gone once folded. Measured before this: the pane held still 16px short for 50ms, then jumped.
	function sweep(from: number, to: number) {
		const padding = getComputedStyle(nav).paddingInlineStart;
		const gap = divider?.getBoundingClientRect().width ?? 0;
		const end = (width: number): Keyframe =>
			width
				? { width: `${width}px`, paddingInline: padding, marginInlineEnd: '0px', opacity: 1 }
				: { width: '0px', paddingInline: '0px', marginInlineEnd: `${-gap}px`, opacity: 0 };
		return play(
			[
				{ ...end(from), overflow: 'hidden' },
				{ ...end(to), overflow: 'hidden' },
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
		// A menu open over it holds it up: reaching the menu can take the pointer past its edge.
		live: () => folded && peek !== 'pinned' && !menu,
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
		veil: {
			// Solid only at the very edge, and fading all the way up: no band of it covers a whole line.
			backgroundImage: 'linear-gradient(to top, var(--color-page), transparent)',
			borderBottomLeftRadius: radius.xl,
			borderBottomRightRadius: radius.xl,
		},
		// The notice a drag asking to fold stands in front of the receding sidebar with: what letting
		// go will do, said on the region it will happen to.
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
		// The sidebar's own ground, so the control reads as part of the chrome around the pane rather
		// than as a menu over it.
		float: {
			backgroundColor: 'var(--color-paper-hover)',
			borderRadius: radius.lg,
			boxShadow: '0 0.25rem 1rem oklch(0 0 0 / 0.14), 0 0 0 1px var(--color-border)',
		},
		// Lit at rest, like the toolbar's, and answered in the pane's color: on the sidebar's ground
		// the quiet control's own hover color is the ground itself. Its corner follows the float's,
		// a rounded rectangle inside a rounded rectangle, rather than the toolbar's circle.
		floatControl: {
			color: 'var(--color-text-strong)',
			borderRadius: radius.md,
			backgroundColor: {
				default: null,
				':hover': 'var(--color-page)',
				':focus-visible': 'var(--color-page)',
			},
		},
	});
</script>

{#snippet entry(section: Section)}
	{@const current = here(section.href)}
	<a
		href={section.href}
		aria-current={current ? 'page' : undefined}
		oncontextmenu={(event) => offer(event, () => sectionMenu(section))}
		class="{ITEM} {stylex.attrs(
			surfaces.quietControl,
			surfaces.uiText,
			rows.item,
			rows.top,
			current && rows.current,
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
				class="pointer-events-none absolute inset-1 z-10 flex items-center justify-center {stylex.attrs(
					styles.notice,
				).class}"
			>
				<!-- An arrow into the edge says what letting go does, and nothing else is written: the
				     sidebar is at its narrowest here, and any word crowded it. -->
				<ArrowLeftToLine class="size-5" aria-hidden="true" />
			</div>
		{/if}
		<!-- Three regions: the sections above and settings below hold still, and the articles
		     between them are the only thing that scrolls, because they are the only list that grows. -->
		<div class="flex shrink-0 flex-col gap-0.5 {stylex.attrs(folding && rows.receded).class}">
			{#each SECTIONS as section (section.href)}
				{@render entry(section)}
			{/each}
		</div>

		<ArticleTree
			articles={data.articles}
			{offer}
			dismiss={() => (menu = undefined)}
			receded={folding}
		/>

		<div class="shrink-0 pt-2 {stylex.attrs(folding && rows.receded).class}">
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
		bind:this={divider}
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
				class="cursor-pointer p-1.5 {stylex.attrs(surfaces.quietControl, styles.floatControl)
					.class}"
			>
				{#if folded}
					<SidebarHidden class="size-4.5" aria-hidden="true" />
				{:else}
					<SidebarShown class="size-4.5" aria-hidden="true" />
				{/if}
			</button>
			<button
				type="button"
				aria-label="Search"
				class="cursor-pointer p-1.5 {stylex.attrs(surfaces.quietControl, styles.floatControl)
					.class}"
			>
				<SearchGlyph class="size-4.5" aria-hidden="true" />
			</button>
		</div>

		<!-- What the page floats over the pane: a drawer at its right, and a toolbar centred at its
		     foot and above everything else there, the drawer included. -->
		{@render chrome.drawer?.()}
		{#if chrome.toolbar}
			<!-- The text fades out before it reaches the toolbar, so the toolbar floats over clear
			     ground rather than over words cut off at its edge. Held still with the pane, beneath
			     the float, the drawer and the toolbar, and rounded to the pane's own corners. -->
			<div
				class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 {stylex.attrs(styles.veil)
					.class}"
			></div>
			<div class="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center">
				<div class="pointer-events-auto">{@render chrome.toolbar()}</div>
			</div>
		{/if}
	</div>
</div>

{#if menu}
	{#key menu}
		<ContextMenu x={menu.x} y={menu.y} items={menu.build()} close={() => (menu = undefined)} />
	{/key}
{/if}

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

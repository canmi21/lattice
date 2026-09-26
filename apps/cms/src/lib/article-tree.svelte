<!--
	@component
	The Articles folder in the sidebar: every article, a folder per category, the controls on its
	row, a new article's row, renaming in place, and the menus those rows offer. The menu itself is
	the layout's, which asks for it through `offer`; this builds what it holds. See
	spec/architecture/local.md.
-->
<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowDownAZ from '@lucide/svelte/icons/arrow-down-a-z';
	import ArrowDownZA from '@lucide/svelte/icons/arrow-down-z-a';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronsDownUp from '@lucide/svelte/icons/chevrons-down-up';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import ClockFading from '@lucide/svelte/icons/clock-fading';
	import Copy from '@lucide/svelte/icons/copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Eye from '@lucide/svelte/icons/eye';
	import FilePlus from '@lucide/svelte/icons/file-plus';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import Funnel from '@lucide/svelte/icons/funnel';
	import FunnelX from '@lucide/svelte/icons/funnel-x';
	import Hash from '@lucide/svelte/icons/hash';
	import Link from '@lucide/svelte/icons/link';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash';
	import Type from '@lucide/svelte/icons/type';
	import X from '@lucide/svelte/icons/x';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { URLS } from '@canmi/urls';
	import { onMount, tick, type Component } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { forget } from './buffer.ts';
	import {
		createDraft,
		discardDraft,
		DRAFTS,
		saveDraft,
		splitPath,
		type Draft,
	} from './collection.ts';
	import { SEPARATOR, type MenuEntry, type MenuItem } from './context-menu.svelte';
	import { foldHeight } from './fold.ts';
	import { recallFolders, rememberFolders } from './folders.ts';
	import { scrollFade } from './scroll-fade.ts';
	import { ITEM, rows, TREE_ITEM } from './sidebar-rows.ts';

	let {
		articles,
		offer,
		dismiss,
		receded,
	}: {
		/**
		 * Every article, draft or published: the draft row outlives publication and is the working
		 * copy from then on, so the draft rows are the whole set. Loaded with the page, and again
		 * whenever something that writes them says so. See spec/todo/milestones.md.
		 */
		articles: Draft[];
		/** Open the sidebar's menu at the event, built from these items when it opens. */
		offer: (event: MouseEvent, build: () => MenuItem[]) => void;
		/** Close the sidebar's menu. */
		dismiss: () => void;
		/** Whether the sidebar is drawn receding, while a drag asks to fold it. */
		receded: boolean;
	} = $props();

	let open = $state(true);

	/** Categories the writer closed; each is open until then. */
	const closed = new SvelteSet<string>();

	/**
	 * Whether the folders are as a reload left them yet. Until then nothing is written, so the
	 * defaults the page renders with are never stored over what was kept, and while they are put
	 * back they go there without moving.
	 */
	let restored = $state(false);

	onMount(() => {
		const kept = recallFolders(localStorage);
		open = kept.open;
		for (const name of kept.closed) closed.add(name);
		void tick().then(() => (restored = true));
	});

	$effect(() => {
		const folders = { open, closed: [...closed] };
		const present = groups.folders.map(([name]) => name);
		if (restored) rememberFolders(localStorage, folders, present);
	});

	/**
	 * How the tree is ordered, cycled by the row's control: by when each was last saved -- the
	 * order the collection answers in, and where it starts -- then by title from A, then from Z.
	 * Folders follow the titles' direction, and keep name order while the tree is by date.
	 */
	type Order = 'recent' | 'az' | 'za';
	let order = $state<Order>('recent');
	const ORDERS: Record<Order, { next: Order; label: string; icon: Component }> = {
		recent: { next: 'az', label: 'Sorted by last saved', icon: ClockFading },
		az: { next: 'za', label: 'Sorted A to Z', icon: ArrowDownAZ },
		za: { next: 'recent', label: 'Sorted Z to A', icon: ArrowDownZA },
	};
	const titleOf = (entry: Draft) => entry.meta.title ?? 'Untitled';

	/** The cell every control on the Articles row stands in, and the two sizes drawn inside it. */
	const CELL = 'grid size-6 shrink-0 cursor-pointer place-items-center';
	const GLYPH = 'size-3.5';
	const DENSE_GLYPH = 'size-3.25';
	function arranged(list: Draft[]): Draft[] {
		if (order === 'recent') return list;
		const sorted = list.toSorted((a, b) => titleOf(a).localeCompare(titleOf(b)));
		return order === 'az' ? sorted : sorted.toReversed();
	}

	/** Filtering has a control and no rule yet: the control only shows which state it is in. */
	let filtering = $state(false);

	/** The articles with no category, and a folder per category in name order. */
	const groups = $derived.by(() => {
		const folders = new Map<string, Draft[]>();
		const loose: Draft[] = [];
		for (const entry of articles) {
			const { category } = splitPath(entry.meta.path);
			if (!category) loose.push(entry);
			else folders.set(category, [...(folders.get(category) ?? []), entry]);
		}
		const named = [...folders].toSorted(([a], [b]) => a.localeCompare(b));
		return {
			loose: arranged(loose),
			folders: (order === 'za' ? named.toReversed() : named).map(
				([name, entries]) => [name, arranged(entries)] as const,
			),
		};
	});

	/**
	 * The step inward per level: small, so depth reads without spending the sidebar's width on it.
	 * A margin rather than padding, so a row's ground -- the current one's highlight -- starts where
	 * its level does and still runs to the sidebar's edge, and the tree reads in the highlight too.
	 */
	const INDENT = ['', 'ms-2', 'ms-4'];

	/**
	 * The row being renamed, in place: an article by its rid, a category by `category:` and its
	 * name. Not wired: leaving the field -- Enter, Escape, or anywhere else -- writes nothing yet.
	 */
	let renaming = $state<{ key: string; value: string }>();

	/** Focus the field a rename opens, with its text chosen so typing replaces it. */
	function field(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function renameKey(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === 'Escape') {
			event.preventDefault();
			renaming = undefined;
		}
	}

	/** The draft whose deletion has been asked for once, and waits for the second ask. */
	let confirming = $state<string>();
	/** Why a deletion was refused, said in the menu that asked for it. */
	let refusal = $state<string>();

	/** A menu opened from here starts with no deletion half asked for. */
	function ask(event: MouseEvent, build: () => MenuItem[]) {
		confirming = undefined;
		refusal = undefined;
		offer(event, build);
	}

	const copy = (text: string) => navigator.clipboard.writeText(text);
	const newTab = (href: string) => void window.open(href, '_blank');

	function articlesMenu(): MenuItem[] {
		return [
			{ label: 'New article', icon: FilePlus, run: start },
			SEPARATOR,
			{
				label: 'Open all folders',
				icon: ChevronsUpDown,
				run: () => {
					open = true;
					closed.clear();
				},
			},
			{
				label: 'Close all folders',
				icon: ChevronsDownUp,
				run: () => {
					for (const [name] of groups.folders) closed.add(name);
				},
			},
		];
	}

	function categoryMenu(category: string): MenuItem[] {
		const shown = !closed.has(category);
		return [
			{
				label: shown ? 'Close folder' : 'Open folder',
				icon: shown ? Folder : FolderOpen,
				run: () => void (shown ? closed.add(category) : closed.delete(category)),
			},
			{
				label: 'Close other folders',
				icon: ChevronsDownUp,
				run: () => {
					for (const [name] of groups.folders) if (name !== category) closed.add(name);
					closed.delete(category);
				},
			},
			SEPARATOR,
			{ label: 'Copy category', icon: Copy, run: () => copy(category) },
			SEPARATOR,
			{
				label: 'Rename',
				icon: Pencil,
				run: () => void (renaming = { key: `category:${category}`, value: category }),
			},
		];
	}

	function articleMenu(entry: Draft): MenuItem[] {
		const href = `/draft/${entry.resource}`;
		const { title, path } = entry.meta;
		return [
			{ label: 'Open', icon: FileText, run: () => goto(href) },
			{ label: 'Open in new tab', icon: ExternalLink, run: () => newTab(href) },
			{ label: 'Preview in new tab', icon: Eye, run: () => newTab(`/preview/${entry.resource}`) },
			SEPARATOR,
			{
				label: 'Copy title',
				icon: Type,
				run: () => copy(title ?? ''),
				refused: title ? undefined : 'It has no title yet',
			},
			{ label: 'Copy ID', icon: Hash, run: () => copy(entry.resource) },
			{
				label: 'Copy path',
				icon: Link,
				run: () => copy(`/${path}`),
				refused: path ? undefined : 'It has no path yet',
			},
			{
				label: 'Copy site link',
				icon: ArrowUpRight,
				run: () => copy(`${URLS.apps.production.site}/${path}`),
				refused: entry.published && path ? undefined : 'It is not on the site',
			},
			SEPARATOR,
			{
				label: 'Rename',
				icon: Pencil,
				run: () => void (renaming = { key: entry.resource, value: entry.meta.title ?? '' }),
			},
			deletion(entry),
		];
	}

	/**
	 * Deleting asks twice, because a draft taken back cannot be brought back: the collection is in
	 * no version control and not yet backed up. A published article is not deleted at all -- taking
	 * one off the site is its own act. See libs/collection/src/discard.ts.
	 */
	function deletion(entry: Draft): MenuEntry {
		const base = { label: 'Delete', icon: Trash, danger: true, stays: true };
		if (entry.published) {
			return {
				...base,
				refused: 'A published article is taken off the site, not deleted',
				run: () => {},
			};
		}
		if (refusal) return { ...base, label: refusal, refused: refusal, run: () => {} };
		if (confirming !== entry.resource) {
			return { ...base, run: () => void (confirming = entry.resource) };
		}
		return { ...base, label: 'Click again to delete', armed: true, run: () => remove(entry) };
	}

	async function remove(entry: Draft) {
		const done = await discardDraft(entry.resource);
		if (!done.discarded) {
			refusal = done.detail;
			return;
		}
		dismiss();
		forget(entry.resource);
		await invalidate(DRAFTS);
		if (page.url.pathname === `/draft/${entry.resource}`) await goto('/');
	}

	/**
	 * A new article starts as a row asking for its title, and nothing exists until one is given and
	 * Enter confirms it: only then is `local` asked for a rid. An empty row goes away on Escape or a
	 * press anywhere else. A row with words in it is kept through a press elsewhere -- a stray click
	 * should not cost what was typed -- and goes only on Escape or its own cancel control. An
	 * identity reserved for a row the writer abandoned would be a draft nobody asked for.
	 */
	let drafting = $state<{ value: string }>();
	let creating = false;

	function start() {
		open = true;
		drafting = { value: '' };
	}

	async function settleNew(keep: boolean) {
		const title = drafting?.value.trim();
		drafting = undefined;
		if (!keep || !title || creating) return;
		creating = true;
		try {
			const { resource } = await createDraft();
			await saveDraft(resource, '', { title });
			await invalidate(DRAFTS);
			await goto(`/draft/${resource}`);
		} finally {
			creating = false;
		}
	}

	function newKey(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === 'Escape') {
			event.preventDefault();
			void settleNew(event.key === 'Enter');
		}
	}
</script>

<!-- A control on the Articles row: its ink alone answers the pointer, the row being lit already.
     Each stands in the same fixed cell, so the spacing is the cells' and never moves; what a glyph
     is drawn at inside its cell is set per glyph, because two drawings at one size do not look one
     size -- the funnel and the clock fill more of their box than the arrows, the plus and the
     chevron, and are drawn a step smaller to read alike. -->
{#snippet control(label: string, Icon: Component, run: () => void, glyph = GLYPH)}
	<button
		type="button"
		aria-label={label}
		title={label}
		onclick={run}
		class="{CELL} {stylex.attrs(surfaces.quietControl, rows.top, rows.bare).class}"
	>
		<Icon class={glyph} aria-hidden="true" />
	</button>
{/snippet}

{#snippet chevron(shown: boolean)}
	<ChevronRight
		class="size-3.5 {shown ? 'rotate-90' : ''} {stylex.attrs(rows.chevron).class}"
		aria-hidden="true"
	/>
{/snippet}

{#snippet article(entry: Draft, depth: number)}
	{@const href = `/draft/${entry.resource}`}
	{@const current = page.url.pathname === href}
	<li class="flex flex-col">
		{#if renaming?.key === entry.resource}
			{@render renamer(FileText, depth)}
		{:else}
			<a
				{href}
				aria-current={current ? 'page' : undefined}
				title={entry.meta.title ?? 'Untitled'}
				oncontextmenu={(event) => ask(event, () => articleMenu(entry))}
				class="{TREE_ITEM} {INDENT[depth]} {stylex.attrs(
					rows.tight,
					surfaces.quietControl,
					surfaces.uiText,
					rows.item,
					current && rows.current,
				).class}"
			>
				<FileText class="size-4 shrink-0" aria-hidden="true" />
				<span class="truncate {stylex.attrs(!entry.meta.title && rows.unnamed).class}"
					>{entry.meta.title ?? 'Untitled'}</span
				>
			</a>
		{/if}
	</li>
{/snippet}

<!-- A row turned into its own name, to be written over: the row's shape and icon, on the ground a
     current row takes, so it is plain which one is being renamed. -->
{#snippet renamer(Icon: Component, depth: number)}
	{#if renaming}
		<label
			class="{TREE_ITEM} {INDENT[depth]} {stylex.attrs(
				rows.tight,
				surfaces.uiText,
				rows.item,
				rows.current,
			).class}"
		>
			<Icon class="size-4 shrink-0" aria-hidden="true" />
			<input
				bind:value={renaming.value}
				use:field
				onkeydown={renameKey}
				onblur={() => (renaming = undefined)}
				aria-label="New name"
				class="min-w-0 flex-1 bg-transparent outline-none"
			/>
		</label>
	{/if}
{/snippet}

<div class="mt-3 flex min-h-0 flex-1 flex-col {stylex.attrs(receded && rows.receded).class}">
	<!-- Articles, a folder of every article, and inside it a folder per category. The depth is
	     said by a small step inward rather than a full one per level, so a deep list does not
	     run out of width. Only Articles carries a chevron, at the row's end beside the control
	     that creates one; a category says it is open by its folder icon alone. -->
	<!-- The row is lit as one under the pointer, controls and all, but only the name opens
	     the folder and only each control does what it shows: the room between them does
	     nothing. -->
	<div class="flex shrink-0 items-center {stylex.attrs(rows.item).class}">
		<button
			type="button"
			aria-expanded={open}
			onclick={() => (open = !open)}
			oncontextmenu={(event) => ask(event, articlesMenu)}
			class="{ITEM} min-w-0 flex-1 cursor-pointer text-left {stylex.attrs(
				surfaces.quietControl,
				surfaces.uiText,
				rows.top,
				rows.bare,
			).class}"
		>
			{#if open}
				<FolderOpen class="size-4 shrink-0" aria-hidden="true" />
			{:else}
				<Folder class="size-4 shrink-0" aria-hidden="true" />
			{/if}
			<span class="truncate">Articles</span>
		</button>
		<div class="flex shrink-0 items-center pe-1">
			{@render control(
				ORDERS[order].label,
				ORDERS[order].icon,
				() => (order = ORDERS[order].next),
				order === 'recent' ? DENSE_GLYPH : GLYPH,
			)}
			{@render control(
				filtering ? 'Filter on' : 'Filter off',
				filtering ? FunnelX : Funnel,
				() => (filtering = !filtering),
				DENSE_GLYPH,
			)}
			{@render control('New article', Plus, start)}
			<button
				type="button"
				tabindex="-1"
				aria-hidden="true"
				onclick={() => (open = !open)}
				class="{CELL} {stylex.attrs(surfaces.quietControl, rows.top, rows.bare).class}"
			>
				{@render chevron(open)}
			</button>
		</div>
	</div>

	<!-- The folder's row stays at the top of the region, with the control that creates an
	     article, and the tree under it scrolls. Folded by its height, not removed: see
	     $lib/fold.ts. -->
	<div use:scrollFade class="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
		<div use:foldHeight={{ open, still: !restored }} class="overflow-hidden">
			<!-- A step of room under the folder's row, the same the sections keep between them, so
			     the folder and its first entry never share an edge when both are lit. -->
			<ul class="flex flex-col pt-0.5">
				{#if drafting}
					<li class="flex flex-col">
						<label
							class="{TREE_ITEM} {INDENT[1]} {stylex.attrs(
								rows.tight,
								surfaces.uiText,
								rows.item,
								rows.current,
							).class}"
						>
							<FileText class="size-4 shrink-0" aria-hidden="true" />
							<input
								bind:value={drafting.value}
								use:field
								onkeydown={newKey}
								onblur={() => {
									if (!drafting?.value.trim()) void settleNew(false);
								}}
								placeholder="Title"
								aria-label="New article's title"
								class="min-w-0 flex-1 bg-transparent outline-none"
							/>
							<!-- Pressed without taking the focus from the field, so the field's own leaving
							     does not run first. -->
							<button
								type="button"
								aria-label="Cancel the new article"
								onmousedown={(event) => event.preventDefault()}
								onclick={() => void settleNew(false)}
								class="shrink-0 cursor-pointer {stylex.attrs(surfaces.quietControl, rows.bare)
									.class}"
							>
								<X class="size-3.5" aria-hidden="true" />
							</button>
						</label>
					</li>
				{/if}
				{#each groups.loose as entry (entry.resource)}
					{@render article(entry, 1)}
				{/each}
				{#each groups.folders as [category, entries] (category)}
					{@const shown = !closed.has(category)}
					<li class="flex flex-col">
						{#if renaming?.key === `category:${category}`}
							{@render renamer(shown ? FolderOpen : Folder, 1)}
						{:else}
							<button
								type="button"
								aria-expanded={shown}
								onclick={() => (shown ? closed.add(category) : closed.delete(category))}
								oncontextmenu={(event) => ask(event, () => categoryMenu(category))}
								class="{TREE_ITEM} {INDENT[1]} cursor-pointer text-left {stylex.attrs(
									rows.tight,
									surfaces.quietControl,
									surfaces.uiText,
									rows.item,
								).class}"
							>
								{#if shown}
									<FolderOpen class="size-4 shrink-0" aria-hidden="true" />
								{:else}
									<Folder class="size-4 shrink-0" aria-hidden="true" />
								{/if}
								<span class="truncate">{category}</span>
							</button>
						{/if}
						<div use:foldHeight={{ open: shown, still: !restored }} class="overflow-hidden">
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
</div>

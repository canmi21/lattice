<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import House from '@lucide/svelte/icons/house';
	import Link from '@lucide/svelte/icons/link';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Plus from '@lucide/svelte/icons/plus';
	import Settings from '@lucide/svelte/icons/settings';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { duration, easing, radius } from '@canmi/tokens/vocabulary.stylex';
	import type { Component } from 'svelte';
	import { createDraft, DRAFTS } from '$lib/collection.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

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

	async function start() {
		const { resource } = await createDraft();
		open = true;
		await invalidate(DRAFTS);
		await goto(`/draft/${resource}`);
	}

	const here = (href: string) => page.url.pathname === href;

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
		chevron: {
			transitionProperty: 'rotate',
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
	});

	const ITEM = 'flex min-w-0 items-center gap-2 px-2 py-1.5 no-underline';
</script>

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
		<span class="truncate max-md:sr-only">{section.label}</span>
	</a>
{/snippet}

<div data-ground class="flex h-dvh flex-col gap-2 overflow-hidden p-2 md:flex-row">
	<nav class="flex shrink-0 gap-1 px-1 md:w-60 md:flex-col md:py-2">
		<div class="flex min-h-0 flex-1 gap-0.5 md:flex-col md:overflow-y-auto">
			{#each SECTIONS as section (section.href)}
				{@render entry(section)}
			{/each}

			<!-- A folder: the row opens and closes it, and the list under it is every article. -->
			<div class="mt-3 flex items-center gap-0.5 max-md:hidden">
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
					<ChevronRight
						class="size-3.5 shrink-0 {open ? 'rotate-90' : ''} {stylex.attrs(styles.chevron).class}"
						aria-hidden="true"
					/>
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
					class="cursor-pointer p-1.5 {stylex.attrs(
						surfaces.quietControl,
						surfaces.uiText,
						styles.item,
					).class}"
				>
					<Plus class="size-4" aria-hidden="true" />
				</button>
			</div>

			{#if open}
				<ul class="flex flex-col gap-0.5 max-md:hidden">
					{#each articles as article (article.resource)}
						{@const href = `/draft/${article.resource}`}
						{@const current = page.url.pathname === href}
						<li>
							<a
								{href}
								aria-current={current ? 'page' : undefined}
								title={article.meta.title ?? 'Untitled'}
								class="{ITEM} ps-8 {stylex.attrs(
									surfaces.quietControl,
									surfaces.uiText,
									styles.item,
									current && styles.current,
								).class}"
							>
								<FileText class="size-4 shrink-0" aria-hidden="true" />
								<span class="truncate {stylex.attrs(!article.meta.title && styles.unnamed).class}"
									>{article.meta.title ?? 'Untitled'}</span
								>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="md:pt-2">{@render entry(SETTINGS)}</div>
	</nav>

	<!-- The pane is the one thing that scrolls. The ground holds still around it, so the sections
	     and the pane's corners stay where they are while the text moves, and a sticky bar inside
	     sticks to the pane's top edge. A page that wants a measure sets its own. -->
	<div
		class="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pt-8 pb-24 md:px-8 {stylex.attrs(
			surfaces.page,
			styles.pane,
		).class}"
	>
		{@render children()}
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

<script lang="ts">
	/**
	 * Writing a draft: the text and nothing else on the page.
	 *
	 * What the article is -- its title, subtitle, description, address and language -- is not the
	 * writing, and it is kept out of the way of it: in a drawer at the pane's right, opened from the
	 * toolbar that floats at the pane's foot with everything else a draft can have done to it. See
	 * spec/architecture/local.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { invalidate } from '$app/navigation';
	import Eye from '@lucide/svelte/icons/eye';
	import PanelRight from '@lucide/svelte/icons/panel-right';
	import Save from '@lucide/svelte/icons/save';
	import Send from '@lucide/svelte/icons/send';
	import X from '@lucide/svelte/icons/x';
	import { onMount, type Component } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { edgeReveal } from '@canmi/behavior/edge';
	import { pressMotion, prefersReducedMotion } from '@canmi/motion';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { border, family, figures, radius, text } from '@canmi/tokens/vocabulary.stylex';
	import Editor from '$lib/editor.svelte';
	import { forget, recall, remember } from '$lib/buffer.ts';
	import { EDGE_MARGINS, useChrome } from '$lib/chrome.svelte.ts';
	import {
		DRAFTS,
		listRevisions,
		publishDraft,
		saveDraft,
		type Publication,
	} from '$lib/collection.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Each field starts from the row and is the page's own once typed into; moving to another
	// article resets them all, because they are derived from the draft that was loaded.
	const rid = $derived(data.draft.resource);
	let title = $derived(data.draft.meta.title ?? '');
	let subtitle = $derived(data.draft.meta.subtitle ?? '');
	let description = $derived(data.draft.meta.description ?? '');
	let path = $derived(data.draft.meta.path ?? '');
	let language = $derived(data.draft.meta.language ?? '');
	let revisions = $derived(data.revisions);
	let missing = $derived.by((): string[] => (void data.draft, []));

	/**
	 * The drawer holding what the article is: shut, out because the pointer ran to the window's
	 * right edge and going back when it leaves, or pinned open by the toolbar until closed.
	 */
	let details = $state<'closed' | 'hover' | 'pinned'>('closed');
	let drawerElement = $state<HTMLElement>();

	// The right edge brings the drawer out the way the left edge brings out a folded sidebar, on the
	// same margins; a drawer pinned by the toolbar is the toolbar's. See @canmi/behavior/edge.
	const edge = edgeReveal({
		side: 'right',
		...EDGE_MARGINS,
		live: () => details !== 'pinned',
		out: () => details === 'hover',
		panel: () => drawerElement,
		reveal: () => (details = 'hover'),
		conceal: () => (details = 'closed'),
	});

	/**
	 * The editor is the one region the server leaves empty: it is a rich-text view that exists
	 * only in a browser, and what it opens on may be the buffer, which only the browser has. So it
	 * mounts after hydration, and until then everything around it is already there.
	 */
	let mounted = $state(false);
	onMount(() => (mounted = true));

	// The row is what was saved; the buffer is what was typed after that. The later of the two
	// wins, and the page says so rather than resolving it silently.
	const buffered = $derived(mounted ? recall(rid) : undefined);
	let body = $derived(buffered ?? data.draft.body);
	let said = $derived(
		buffered !== undefined && buffered !== data.draft.body ? 'Recovered unsaved text.' : undefined,
	);

	function typed(value: string) {
		body = value;
		remember(rid, value);
	}

	// A blank field is a field nobody has filled in, so it travels as absent rather than as an
	// empty string -- which is a value, and which the collection would otherwise have to guess at.
	const said_ = (value: string) => (value.trim() === '' ? undefined : value.trim());

	// Every field the draft carries goes back with every save: the row's metadata is replaced
	// whole, so a field left out here would be a field a save erased.
	async function save() {
		const held = await saveDraft(rid, body, {
			title: said_(title),
			subtitle: said_(subtitle),
			description: said_(description),
			path: said_(path),
			language: said_(language),
		});
		forget(rid);
		said = `Saved ${held.updated.slice(11, 19)}`;
		// The sidebar names the article by its title and orders it by this save.
		await invalidate(DRAFTS);
	}

	// The preview reads the row, so what it shows is what was just written only once it is saved.
	// It opens in a tab of its own, so the editor stays where it was. The tab is opened inside the
	// click and pointed at the preview once the save lands: a window opened after an await is no
	// longer the click's, and the browser blocks it. See preview/[rid]/+page.svelte.
	function look() {
		const tab = window.open('about:blank', '_blank');
		void save()
			.then(() => {
				if (tab) tab.location.href = `/preview/${rid}`;
			})
			.catch(() => tab?.close());
	}

	async function publish() {
		await save();
		const done: Publication = await publishDraft(rid);
		missing = done.published ? [] : (done.missing ?? []);
		said = done.published ? `Published as revision ${done.seq}` : done.detail;
		// A publication refused for a missing field is answered where the fields are.
		if (missing.length > 0) details = 'pinned';
		if (done.published) revisions = await listRevisions(rid);
	}

	/** The drawer arriving from the right edge, on the site's timing for a surface answering a press. */
	function arrive(node: HTMLElement) {
		return {
			duration: prefersReducedMotion() ? 0 : pressMotion(node.offsetWidth).duration * 1000,
			easing: cubicOut,
			css: (t: number) => `transform: translateX(${(1 - t) * 1.5}rem); opacity: ${t};`,
		};
	}

	const styles = stylex.create({
		// Both float over the text, so both are a sheet with an edge and a shadow to say so.
		pill: {
			backgroundColor: 'var(--color-paper)',
			borderRadius: radius.full,
			boxShadow: '0 0.5rem 1.5rem oklch(0 0 0 / 0.12), 0 0 0 1px var(--color-border)',
		},
		sheet: {
			backgroundColor: 'var(--color-paper)',
			borderRadius: radius.xl,
			boxShadow: '0 0.5rem 2rem oklch(0 0 0 / 0.14), 0 0 0 1px var(--color-border)',
		},
		round: { borderRadius: radius.full },
		pressed: {
			color: 'var(--color-text-strong)',
			backgroundColor: 'var(--color-paper-hover)',
		},
		quiet: { color: 'var(--color-text-soft)' },
		missing: { color: 'var(--color-red)' },
		heading: { color: 'var(--color-text-strong)' },
		rid: { color: 'var(--color-text-muted)', fontFamily: family.monoTheme, fontSize: text.px13 },
		label: { color: 'var(--color-text-soft)', fontSize: text.px13 },
		field: {
			color: 'var(--color-text)',
			borderBottomWidth: border.hairlinePx,
			borderBottomStyle: 'solid',
			borderBottomColor: { default: 'var(--color-border)', ':focus': 'var(--color-border-strong)' },
			'::placeholder': { color: 'var(--color-text-soft)' },
		},
		absent: {
			borderBottomColor: { default: 'var(--color-red)', ':focus': 'var(--color-red)' },
		},
		divider: { backgroundColor: 'var(--color-border)' },
		revision: { color: 'var(--color-text-muted)', fontVariantNumeric: figures.tabular },
	});

	/** A field's class, marked when a refused publication named it as missing. */
	const field = (key: string) =>
		`w-full bg-transparent py-1 outline-none ${stylex.attrs(styles.field, missing.includes(key) && styles.absent).class}`;

	useChrome({ toolbar, drawer });
</script>

<svelte:document onpointermove={edge} />

<!-- An icon alone: the label is what a screen reader says and what the pointer is told on hover. -->
{#snippet action(label: string, Icon: Component, run: () => void, on = false)}
	<button
		type="button"
		onclick={run}
		aria-label={label}
		title={label}
		aria-pressed={on || undefined}
		class="cursor-pointer p-2 {stylex.attrs(
			surfaces.quietControl,
			styles.round,
			on && styles.pressed,
		).class}"
	>
		<Icon class="size-4" aria-hidden="true" />
	</button>
{/snippet}

{#snippet toolbar()}
	<div class="flex items-center gap-0.5 p-0.5 {stylex.attrs(styles.pill).class}">
		{@render action(
			'Details',
			PanelRight,
			() => (details = details === 'pinned' ? 'closed' : 'pinned'),
			details !== 'closed',
		)}
		<span class="mx-0.5 h-4 w-px {stylex.attrs(styles.divider).class}" aria-hidden="true"></span>
		{@render action('Preview', Eye, look)}
		{@render action('Save', Save, save)}
		{@render action('Publish', Send, publish)}
	</div>
{/snippet}

{#snippet drawer()}
	{#if details !== 'closed'}
		<!-- It stops above the toolbar rather than running under it, so nothing it holds is covered. -->
		<aside
			bind:this={drawerElement}
			transition:arrive
			aria-label="Details"
			class="absolute top-2 right-2 bottom-20 z-30 flex w-88 max-w-[calc(100%-1rem)] flex-col gap-6 overflow-y-auto p-5 {stylex.attrs(
				surfaces.uiText,
				styles.sheet,
			).class}"
		>
			<header class="flex items-center gap-2">
				<h2 class={stylex.attrs(styles.heading).class}>Details</h2>
				<span class={stylex.attrs(styles.rid).class}>{rid}</span>
				<button
					type="button"
					aria-label="Close the details"
					onclick={() => (details = 'closed')}
					class="ms-auto cursor-pointer p-1 {stylex.attrs(surfaces.quietControl, styles.round)
						.class}"
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</header>

			<!-- Where the last save and a refused publication are said, for now: a place kept until
			     it is decided where this belongs. -->
			{#if missing.length > 0}
				<p class={stylex.attrs(styles.missing).class}>Missing: {missing.join(', ')}</p>
			{:else if said}
				<p class={stylex.attrs(styles.quiet).class}>{said}</p>
			{/if}

			<div class="flex flex-col gap-4">
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Title</span>
					<input bind:value={title} placeholder="Untitled" class={field('title')} />
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Subtitle</span>
					<input
						bind:value={subtitle}
						placeholder="A line under the title"
						class={field('subtitle')}
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Path</span>
					<input bind:value={path} placeholder="architecture/some-slug" class={field('path')} />
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Language</span>
					<input bind:value={language} placeholder="en" class={field('language')} />
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Description</span>
					<textarea
						bind:value={description}
						rows="3"
						placeholder="What the article is about, for search and sharing"
						class="resize-none {field('description')}"></textarea>
				</label>
			</div>

			{#if revisions.length > 0}
				<section class="flex flex-col gap-1">
					<h3 class={stylex.attrs(styles.label).class}>Revisions</h3>
					<ul>
						{#each revisions as revision (revision.seq)}
							<li class="py-0.5 {stylex.attrs(styles.revision).class}">
								{revision.seq} · {revision.at.slice(0, 10)}{revision.atLocked ? ' · locked' : ''}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</aside>
	{/if}
{/snippet}

<!-- Mounted in the browser only, and remounted per article: the editor reads its text once,
     when it opens, so a second article has to be a second editor. The height is held so the
     region does not arrive by pushing anything down. -->
<div class="mx-auto min-h-96 max-w-(--rail-column) px-6">
	{#if mounted}
		{#key rid}<Editor markdown={body} onChange={typed} />{/key}
	{/if}
</div>

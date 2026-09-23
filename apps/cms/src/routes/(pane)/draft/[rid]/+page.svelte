<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { border, family, figures, radius, text } from '@canmi/tokens/vocabulary.stylex';
	import Editor from '$lib/editor.svelte';
	import { forget, recall, remember } from '$lib/buffer.ts';
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
	let path = $derived(data.draft.meta.path ?? '');
	let language = $derived(data.draft.meta.language ?? '');
	let revisions = $derived(data.revisions);
	let missing = $derived.by((): string[] => (void data.draft, []));

	/**
	 * The editor is the one region the server leaves empty: it is a rich-text view that exists
	 * only in a browser, and what it opens on may be the buffer, which only the browser has. So it
	 * mounts after hydration, and until then the fields and everything around it are already there.
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

	async function save() {
		const held = await saveDraft(rid, body, {
			title: said_(title),
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
		if (done.published) revisions = await listRevisions(rid);
	}

	const styles = stylex.create({
		// The bar stays over the text while it scrolls, so it takes the page's ground to hide what
		// passes under it, and one hairline to say where it ends.
		bar: {
			backgroundColor: 'var(--color-page)',
			borderBottomWidth: border.hairlinePx,
			borderBottomStyle: 'solid',
			borderBottomColor: 'var(--color-border)',
		},
		crumb: { color: 'var(--color-text-soft)' },
		rid: { color: 'var(--color-text-muted)', fontFamily: family.monoTheme, fontSize: text.px13 },
		quiet: { color: 'var(--color-text-soft)' },
		missing: { color: 'var(--color-red)' },
		button: { borderRadius: radius.md },
		// The article's own title is the strong ink and nothing else -- its size is the body's --
		// so the field it is typed into is too.
		title: {
			color: 'var(--color-text-strong)',
			'::placeholder': { color: 'var(--color-text-soft)' },
		},
		label: {
			color: 'var(--color-text-soft)',
			fontSize: text.px13,
		},
		field: {
			color: 'var(--color-text)',
			borderBottomWidth: border.hairlinePx,
			borderBottomStyle: 'solid',
			borderBottomColor: { default: 'var(--color-border)', ':focus': 'var(--color-border-strong)' },
			'::placeholder': { color: 'var(--color-text-soft)' },
		},
		revision: { color: 'var(--color-text-muted)', fontVariantNumeric: figures.tabular },
	});
</script>

{#snippet action(label: string, run: () => void)}
	<button
		onclick={run}
		class="cursor-pointer px-3 py-1 {stylex.attrs(
			surfaces.interactive,
			surfaces.colorShift,
			surfaces.uiText,
			styles.button,
		).class}">{label}</button
	>
{/snippet}

<div
	class="sticky -top-8 z-10 -mx-4 -mt-8 mb-8 px-4 py-2.5 md:-mx-8 md:px-8 {stylex.attrs(styles.bar)
		.class}"
>
	<div
		class="mx-auto flex max-w-(--rail-column) px-6 items-center gap-2 {stylex.attrs(surfaces.uiText)
			.class}"
	>
		<a href="/articles" class="no-underline {stylex.attrs(surfaces.quietControl).class}">Articles</a
		>
		<span class={stylex.attrs(styles.quiet).class}>/</span>
		<span class={stylex.attrs(styles.rid).class}>{rid}</span>
		<span class="min-w-0 flex-1 truncate ps-2">
			{#if missing.length > 0}
				<span class={stylex.attrs(styles.missing).class}>missing: {missing.join(', ')}</span>
			{:else if said}
				<span class={stylex.attrs(styles.quiet).class}>{said}</span>
			{/if}
		</span>
		{@render action('Preview', look)}
		{@render action('Save', save)}
		{@render action('Publish', publish)}
	</div>
</div>

<div class="mx-auto mb-10 max-w-(--rail-column) px-6">
	<input
		bind:value={title}
		placeholder="Untitled"
		aria-label="Title"
		class="w-full bg-transparent outline-none {stylex.attrs(styles.title).class}"
	/>
	<div class="mt-4 flex flex-wrap gap-x-8 gap-y-3 {stylex.attrs(surfaces.uiText).class}">
		<label class="flex min-w-0 flex-1 basis-64 items-baseline gap-3">
			<span class={stylex.attrs(styles.label).class}>Path</span>
			<input
				bind:value={path}
				placeholder="architecture/some-slug"
				class="min-w-0 flex-1 bg-transparent py-0.5 outline-none {stylex.attrs(styles.field).class}"
			/>
		</label>
		<label class="flex items-baseline gap-3">
			<span class={stylex.attrs(styles.label).class}>Language</span>
			<input
				bind:value={language}
				placeholder="en"
				class="w-16 bg-transparent py-0.5 outline-none {stylex.attrs(styles.field).class}"
			/>
		</label>
	</div>
</div>

<!-- Mounted in the browser only, and remounted per article: the editor reads its text once,
     when it opens, so a second article has to be a second editor. The height is held so the
     region does not arrive by pushing the revisions down. -->
<div class="mx-auto min-h-96 max-w-(--rail-column) px-6">
	{#if mounted}
		{#key rid}<Editor markdown={body} onChange={typed} />{/key}
	{/if}
</div>

{#if revisions.length > 0}
	<div class="mx-auto mt-16 max-w-(--rail-column) px-6 {stylex.attrs(surfaces.uiText).class}">
		<h2 class="mb-2 {stylex.attrs(styles.label).class}">Revisions</h2>
		<ul>
			{#each revisions as revision (revision.seq)}
				<li class="py-0.5 {stylex.attrs(styles.revision).class}">
					{revision.seq} · {revision.at.slice(0, 10)}{revision.atLocked ? ' · locked' : ''}
				</li>
			{/each}
		</ul>
	</div>
{/if}

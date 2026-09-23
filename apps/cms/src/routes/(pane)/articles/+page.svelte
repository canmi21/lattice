<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { goto, invalidate } from '$app/navigation';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { border, family, figures, radius, text } from '@canmi/tokens/vocabulary.stylex';
	import { createDraft, DRAFTS } from '$lib/collection.ts';
	import type { PageProps } from './$types';

	// The list the layout already loaded for the sidebar: one read serves both.
	let { data }: PageProps = $props();
	const drafts = $derived(data.articles);

	// A new article is an id being reserved, not a file being made: the row exists before anything
	// has been decided about it, which is what lets the editor open on it. See resource.md.
	async function start() {
		const { resource } = await createDraft();
		await invalidate(DRAFTS);
		await goto(`/draft/${resource}`);
	}

	// A ledger rather than the reading row: this list is worked, not read, so a row is one line
	// in columns its header names. See spec/architecture/local.md.
	const styles = stylex.create({
		title: { fontSize: text.px15 },
		button: { borderRadius: radius.md },
		label: {
			color: 'var(--color-text-soft)',
			fontSize: text.px13,
		},
		row: {
			borderTopWidth: border.hairlinePx,
			borderTopStyle: 'solid',
			borderTopColor: 'var(--color-border)',
			backgroundColor: { default: null, ':hover': 'var(--color-paper-hover)' },
		},
		name: { color: 'var(--color-text-strong)' },
		unnamed: { color: 'var(--color-text-soft)' },
		fact: { color: 'var(--color-text-muted)', fontVariantNumeric: figures.tabular },
		rid: { fontFamily: family.monoTheme, fontSize: text.px13 },
		quiet: { color: 'var(--color-text-soft)' },
	});

	const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] items-baseline gap-4 px-2';
</script>

<div class="mx-auto w-full max-w-3xl">
	<div class="mb-6 flex items-center justify-between">
		<h1 class={stylex.attrs(surfaces.heading, styles.title).class}>Articles</h1>
		<button
			onclick={start}
			class="cursor-pointer px-3 py-1 {stylex.attrs(
				surfaces.interactive,
				surfaces.colorShift,
				surfaces.uiText,
				styles.button,
			).class}">New</button
		>
	</div>

	{#if drafts.length === 0}
		<p class={stylex.attrs(surfaces.uiText, styles.quiet).class}>Nothing written yet.</p>
	{:else}
		<div class="{COLUMNS} pb-2 {stylex.attrs(styles.label).class}">
			<span>Title</span><span>Id</span><span class="text-right">Saved</span>
		</div>
		<ul>
			{#each drafts as draft (draft.resource)}
				<li>
					<a
						href="/draft/{draft.resource}"
						class="{COLUMNS} py-2.5 no-underline {stylex.attrs(
							surfaces.uiText,
							surfaces.colorShift,
							styles.row,
						).class}"
					>
						<span
							class="truncate {stylex.attrs(draft.meta.title ? styles.name : styles.unnamed).class}"
							>{draft.meta.title ?? 'Untitled'}</span
						>
						<span class={stylex.attrs(styles.fact, styles.rid).class}>{draft.resource}</span>
						<span class="text-right {stylex.attrs(styles.fact).class}"
							>{draft.updated.slice(0, 10)}</span
						>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import ArticleBody from '@canmi/prose/body.svelte';
	import Shell from '@canmi/prose/shell.svelte';
	import { articleRailScript } from '@canmi/prose/rail';
	import { currentTheme } from '@canmi/theme';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { border, family, figures, radius, text } from '@canmi/tokens/vocabulary.stylex';
	import Editor from '$lib/editor.svelte';
	import { forget, recall, remember } from '$lib/buffer.ts';
	import {
		previewDraft,
		type Preview,
		listRevisions,
		publishDraft,
		readDraft,
		saveDraft,
		type Draft,
		type Publication,
		type Revision,
	} from '$lib/collection.ts';

	const rid = $derived(page.params.rid ?? '');

	let draft = $state<Draft | undefined>(undefined);
	let body = $state('');
	let title = $state('');
	let path = $state('');
	let language = $state('');
	let revisions = $state<Revision[]>([]);
	let said = $state<string | undefined>(undefined);
	let preview = $state<Preview | undefined>(undefined);
	let showing = $state(false);
	let missing = $state<string[]>([]);

	$effect(() => {
		const id = rid;
		if (!id) return;
		void readDraft(id).then((held) => {
			draft = held;
			// The row is what was saved; the buffer is what was typed after that. The later of the
			// two wins, and the page says so rather than resolving it silently.
			const buffered = recall(id);
			body = buffered ?? held.body;
			if (buffered !== undefined && buffered !== held.body) said = 'Recovered unsaved text.';
			title = held.meta.title ?? '';
			path = held.meta.path ?? '';
			language = held.meta.language ?? '';
		});
		void listRevisions(id).then((held) => (revisions = held));
	});

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
		draft = held;
		forget(rid);
		said = `Saved ${held.updated.slice(11, 19)}`;
	}

	// Compiled where the compiler is, then rendered with the components the site renders with --
	// so what is shown here is the article and not an approximation of it. See milestones.md B3a.
	async function look() {
		showing = !showing;
		if (!showing) return;
		await save();
		preview = await previewDraft(rid);
		said = undefined;
		// The rail's vertical placement is a measurement, and the site takes it in a shell script
		// once the markup is there. Here the markup arrives after a fetch, so it is taken then.
		await tick();
		new Function(articleRailScript)();
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
		// so the field it is typed into is too, and the preview's header matches the site's.
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
	class="sticky top-0 z-10 -mx-4 -mt-8 mb-8 px-4 py-2.5 md:-mx-8 md:px-8 {stylex.attrs(styles.bar)
		.class}"
>
	<div class="mx-auto flex max-w-3xl items-center gap-2 {stylex.attrs(surfaces.uiText).class}">
		<a href="/" class="no-underline {stylex.attrs(surfaces.quietControl).class}">Drafts</a>
		<span class={stylex.attrs(styles.quiet).class}>/</span>
		<span class={stylex.attrs(styles.rid).class}>{rid}</span>
		<span class="min-w-0 flex-1 truncate ps-2">
			{#if missing.length > 0}
				<span class={stylex.attrs(styles.missing).class}>missing: {missing.join(', ')}</span>
			{:else if said}
				<span class={stylex.attrs(styles.quiet).class}>{said}</span>
			{/if}
		</span>
		{#if draft}
			{@render action(showing ? 'Edit' : 'Preview', look)}
			{@render action('Save', save)}
			{@render action('Publish', publish)}
		{/if}
	</div>
</div>

{#if draft === undefined}
	<p class="mx-auto max-w-3xl {stylex.attrs(surfaces.uiText, styles.quiet).class}">
		Opening {rid}…
	</p>
{:else}
	<div class="mx-auto mb-10 max-w-3xl">
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
					class="min-w-0 flex-1 bg-transparent py-0.5 outline-none {stylex.attrs(styles.field)
						.class}"
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

	{#if showing && preview}
		<!-- The page the site reads an article on, drawn around this draft. Not a preview layout:
		     the same component, so there is nothing here that can drift from what is published. -->
		<Shell toc={preview.toc} locale="mw" theme={currentTheme()}>
			{#snippet home()}
				<!-- The rail script measures this to place the rail; the site's own control links
				     home, which is not where this one is. -->
				<div class="home-slot"></div>
			{/snippet}
			{#snippet header()}
				<h1 class={stylex.attrs(styles.title).class}>{title || 'Untitled'}</h1>
			{/snippet}
			<ArticleBody blocks={preview.blocks} resources={preview.resources} locale="mw" />
		</Shell>
	{:else}
		<div class="mx-auto max-w-3xl"><Editor markdown={draft.body} onChange={typed} /></div>
	{/if}

	{#if revisions.length > 0}
		<div class="mx-auto mt-16 max-w-3xl {stylex.attrs(surfaces.uiText).class}">
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
{/if}

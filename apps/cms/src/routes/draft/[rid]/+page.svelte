<script lang="ts">
	import { page } from '$app/state';
	import ActionBar from '@canmi/prose/action-bar.svelte';
	import ArticleBody from '@canmi/prose/body.svelte';
	import Toc from '@canmi/prose/toc.svelte';
	import { currentTheme } from '@canmi/theme';
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
	}

	async function publish() {
		await save();
		const done: Publication = await publishDraft(rid);
		missing = done.published ? [] : (done.missing ?? []);
		said = done.published ? `Published as revision ${done.seq}` : done.detail;
		if (done.published) revisions = await listRevisions(rid);
	}
</script>

{#if draft === undefined}
	<p class="quiet">Opening {rid}…</p>
{:else}
	<div class="fields">
		<input bind:value={title} placeholder="Title" class="title" />
		<input bind:value={path} placeholder="architecture/some-slug" />
		<input bind:value={language} placeholder="en" class="short" />
	</div>

	{#if showing && preview}
		<!-- The rail and the bar the site draws around an article, drawn around this one. Both are
		     fixed strips that position against the viewport, so they sit outside the column. -->
		<Toc toc={preview.toc} />
		<ActionBar locale="mw" theme={currentTheme()} />
		<article class="preview">
			<ArticleBody blocks={preview.blocks} resources={preview.resources} locale="mw" />
		</article>
	{:else}
		<Editor markdown={draft.body} onChange={typed} />
	{/if}

	<div class="bar">
		<button onclick={save}>Save</button>
		<button onclick={look}>{showing ? 'Edit' : 'Preview'}</button>
		<button onclick={publish}>Publish</button>
		{#if said}<span class="quiet">{said}</span>{/if}
		{#if missing.length > 0}<span class="missing">missing: {missing.join(', ')}</span>{/if}
	</div>

	{#if revisions.length > 0}
		<ul class="revisions">
			{#each revisions as revision (revision.seq)}
				<li class="quiet">
					{revision.seq} · {revision.at.slice(0, 10)}{revision.atLocked ? ' · locked' : ''}
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	input {
		flex: 1 1 12rem;
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--color-border, #ddd);
		border-radius: 0.375rem;
		background: none;
		color: inherit;
		font: inherit;
	}
	.title {
		flex-basis: 100%;
		font-size: 1.25rem;
		font-weight: 600;
	}
	.short {
		flex: 0 0 5rem;
	}
	.bar {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-top: 1.5rem;
	}
	button {
		padding: 0.375rem 0.875rem;
		border: 1px solid var(--color-border, #ddd);
		border-radius: 0.375rem;
		background: none;
		color: inherit;
		cursor: pointer;
		font: inherit;
	}
	.preview {
		min-height: 24rem;
	}
	.revisions {
		margin-top: 2rem;
		padding: 0;
		list-style: none;
	}
	.quiet {
		color: var(--color-text-soft, #888);
		font-size: 0.8125rem;
	}
	.missing {
		color: #b00;
		font-size: 0.8125rem;
	}
</style>

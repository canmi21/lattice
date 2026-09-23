<script lang="ts">
	import { goto } from '$app/navigation';
	import { createDraft, listDrafts, type Draft } from '$lib/collection.ts';

	let drafts = $state<Draft[] | undefined>(undefined);
	let failure = $state<string | undefined>(undefined);

	$effect(() => {
		listDrafts()
			.then((held) => (drafts = held))
			.catch((error: unknown) => (failure = String(error)));
	});

	// A new article is an id being reserved, not a file being made: the row exists before anything
	// has been decided about it, which is what lets the editor open on it. See resource.md.
	async function start() {
		const { resource } = await createDraft();
		await goto(`/draft/${resource}`);
	}
</script>

<h1>Drafts</h1>
<button onclick={start}>New</button>

{#if failure}
	<p class="failure">{failure}</p>
{:else if drafts === undefined}
	<p class="quiet">Reading the collection…</p>
{:else if drafts.length === 0}
	<p class="quiet">Nothing written yet.</p>
{:else}
	<ul>
		{#each drafts as draft (draft.resource)}
			<li>
				<a href="/draft/{draft.resource}">{draft.meta.title ?? 'Untitled'}</a>
				<span class="quiet">{draft.resource} · {draft.updated.slice(0, 10)}</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 600;
	}
	button {
		margin-bottom: 1.5rem;
		padding: 0.375rem 0.875rem;
		border: 1px solid var(--color-border, #ddd);
		border-radius: 0.375rem;
		background: none;
		color: inherit;
		cursor: pointer;
		font: inherit;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		padding: 0.5rem 0;
		border-top: 1px solid var(--color-border, #eee);
	}
	a {
		color: inherit;
	}
	.quiet {
		color: var(--color-text-soft, #888);
		font-size: 0.8125rem;
	}
	.failure {
		color: #b00;
	}
</style>

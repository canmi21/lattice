<script lang="ts">
	import { api, short, when, type Event } from './api';
	import { card, heading } from './ui';

	let { name, signedOut }: { name: string; signedOut: (error: unknown) => boolean } = $props();

	/** A page is fifty, the newest first; each older page starts before the last one shown. */
	const PAGE = 50;
	let events = $state<Event[]>([]);
	let more = $state(true);
	let error = $state('');

	async function older() {
		try {
			const before = events.at(-1)?.id;
			const page = await api.history(name, before);
			events = [...events, ...page];
			more = page.length === PAGE;
		} catch (failure) {
			if (!signedOut(failure)) error = String(failure);
		}
	}

	$effect(() => {
		older();
	});

	const tone = {
		succeeded: 'text-good',
		failed: 'text-danger',
		running: 'text-muted',
		skipped: 'text-warn',
	} as const;

	function source(event: Event): string {
		if (event.source.kind === 'run') {
			return `run ${event.source.run ?? ''} ${event.source.commit?.slice(0, 7) ?? ''}`.trim();
		}
		return event.source.kind;
	}
</script>

<section class={card}>
	<h2 class={heading}>History</h2>
	{#if error}<p class="text-danger">{error}</p>{/if}
	<table>
		<thead>
			<tr><th>When</th><th>Action</th><th>From</th><th>Image</th><th>Outcome</th></tr>
		</thead>
		<tbody>
			{#each events as event (event.id)}
				<tr>
					<td class="text-muted">{when(event.started_at)}</td>
					<td>{event.action.replaceAll('_', ' ')}</td>
					<td>{source(event)}</td>
					<td><code>{short(event.image)}</code></td>
					<td>
						<span class={tone[event.outcome]}>{event.outcome}</span>
						{#if event.detail}<pre
								class="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap">{event.detail}</pre>{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="5" class="text-muted">Nothing yet</td></tr>
			{/each}
		</tbody>
	</table>
	{#if more && events.length > 0}
		<div class="mt-3 flex justify-center"><button onclick={older}>Older</button></div>
	{/if}
</section>

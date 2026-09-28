<script lang="ts">
	/** Everything done to an app, newest first, fifty at a time. */
	import * as stylex from '@stylexjs/stylex';
	import { signedOut } from './session.svelte';
	import { api, short, when, type Event } from './api';
	import Badge from './badge.svelte';
	import Button from './button.svelte';
	import Card from './card.svelte';
	import { ago } from './format';
	import { surfaces, tone, type } from './style/surfaces';

	let { name }: { name: string } = $props();

	/** A page is fifty, the newest first; each older page starts before the last one shown. */
	const PAGE = 50;
	let events = $state<Event[]>([]);
	let more = $state(true);
	let loaded = $state(false);
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
		loaded = true;
	}

	$effect(() => {
		older();
	});

	const outcomes = {
		succeeded: 'good',
		failed: 'danger',
		running: 'busy',
		skipped: 'warn',
	} as const;

	function source(event: Event): string {
		if (event.source.kind === 'run') {
			return `CI run ${event.source.run ?? ''} ${event.source.commit?.slice(0, 7) ?? ''}`.trim();
		}
		return event.source.kind === 'upload' ? 'Upload' : 'Panel';
	}

	function action(event: Event): string {
		const words = event.action.replaceAll('_', ' ');
		return words.charAt(0).toUpperCase() + words.slice(1);
	}
</script>

{#if error}<p class="mb-4 {stylex.attrs(tone.danger).class}">{error}</p>{/if}

<Card flush>
	<table>
		<thead>
			<tr><th>When</th><th>Action</th><th>From</th><th>Image</th><th>Outcome</th></tr>
		</thead>
		<tbody>
			{#each events as event (event.id)}
				<tr>
					<td
						class="whitespace-nowrap {stylex.attrs(tone.muted).class}"
						title={when(event.started_at)}>{ago(event.started_at)}</td
					>
					<td class={stylex.attrs(type.body).class}>{action(event)}</td>
					<td class={stylex.attrs(tone.muted).class}>{source(event)}</td>
					<td><code class={stylex.attrs(type.mono).class}>{short(event.image) || '–'}</code></td>
					<td class="w-1/3">
						<Badge tone={outcomes[event.outcome]}
							>{event.outcome.charAt(0).toUpperCase() + event.outcome.slice(1)}</Badge
						>
						{#if event.detail}
							<pre
								class="mt-2 max-h-48 overflow-auto p-3 whitespace-pre-wrap {stylex.attrs(
									surfaces.well,
								).class}">{event.detail}</pre>
						{/if}
					</td>
				</tr>
			{:else}
				<tr
					><td colspan="5" class={stylex.attrs(tone.muted).class}
						>{loaded ? 'Nothing yet' : 'Loading…'}</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</Card>
{#if more && events.length > 0}
	<div class="mt-4 flex justify-center"><Button variant="ghost" onclick={older}>Older</Button></div>
{/if}

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { byKind, key, overallOf, segmentsOf, stateOf, uptimeOf } from '$lib/board';
	import { Live } from '$lib/live.svelte';
	import { percent } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The server's answer seeds the board once; from here on the browser keeps it.
	const live = new Live(untrack(() => data));

	// Once, on mount: an effect would rerun whenever what start() reads changes, and each rerun
	// closes the socket and opens another.
	onMount(() => live.start());

	const overall = $derived(overallOf(live.checks, live.nowByKey, live.clock));
	const groups = $derived(byKind(live.checks));

	const headline = $derived.by(() => {
		switch (overall.state) {
			case 'up':
				return 'All checks passing';
			case 'down':
				return `${overall.failing} of ${overall.total} checks failing`;
			case 'partial':
				return `${overall.silent} of ${overall.total} checks gone quiet`;
			case 'silent':
				return 'The probe is silent';
			case 'empty':
				return 'No checks reported yet';
		}
	});
</script>

<svelte:head>
	<title>Status</title>
	<meta
		name="description"
		content="Whether the platform's services, APIs, names and pages are answering, checked from outside every few seconds."
	/>
</svelte:head>

<h1>{headline}</h1>

{#each groups as [kind, checks] (kind)}
	<section>
		<h2>{kind}</h2>
		<ul>
			{#each checks as check (key(check.id, check.place))}
				{@const latest = live.nowByKey.get(key(check.id, check.place))}
				{@const state = stateOf(latest, live.clock)}
				{@const uptime = uptimeOf(segmentsOf(live.historyOf(check), live.clock))}
				<li>
					{check.id} -- {state}
					{#if latest}
						-- {latest.durationMs} ms
					{/if}
					-- {uptime === null ? 'no data' : percent(uptime)}
				</li>
			{/each}
		</ul>
	</section>
{/each}

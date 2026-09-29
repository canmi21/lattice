<script lang="ts">
	import { untrack } from 'svelte';
	import { byKind, key, overallOf } from '$lib/board';
	import CheckRow from '$lib/components/check-row.svelte';
	import { Live } from '$lib/live.svelte';
	import { ago } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The server's answer seeds the board once; from here on the browser keeps it.
	const live = new Live(untrack(() => data));
	let local = $state(false);

	$effect(() => {
		local = true;
		return live.start();
	});

	const KIND: Record<string, { title: string; about: string }> = {
		health: { title: 'Services', about: "Each service's own health, asked on the private side." },
		api: { title: 'APIs', about: "The whole chain a visitor's request takes, end to end." },
		dns: { title: 'DNS', about: "Names resolving, through Cloudflare's resolver and Google's." },
		page: { title: 'Pages', about: 'Pages rendered in a real browser, reporting their errors.' },
	};

	const overall = $derived(overallOf(live.checks, live.nowByKey, live.clock));
	const groups = $derived(byKind(live.checks));

	const headline = $derived.by(() => {
		switch (overall.state) {
			case 'up':
				return { text: 'All checks passing', dot: 'bg-green' };
			case 'down':
				return {
					text: `${overall.failing} of ${overall.total} checks failing`,
					dot: 'bg-red',
				};
			case 'partial':
				return {
					text: `${overall.silent} of ${overall.total} checks gone quiet`,
					dot: 'bg-text-soft',
				};
			case 'silent':
				return { text: 'The probe is silent', dot: 'bg-text-soft' };
			case 'empty':
				return { text: 'No checks reported yet', dot: 'bg-border-strong' };
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

<section aria-labelledby="overall" class="mb-12">
	<h1 id="overall" class="flex items-center gap-3 text-2xl font-semibold text-text-strong">
		<span class="size-3 shrink-0 rounded-full {headline.dot}" aria-hidden="true"></span>
		{headline.text}
	</h1>
	<p class="mt-2 text-sm text-text-soft" aria-live="polite">
		{#if overall.state === 'silent'}
			Nothing has been heard from the probe
			{overall.lastHeard ? `since ${ago(overall.lastHeard.getTime(), live.clock)}` : 'yet'}: the
			node, its link or the probe itself is down, so the last results are not shown as current.
		{:else if live.unreachable}
			The database is not answering{live.answeredAt
				? `; last answered ${ago(live.answeredAt, live.clock)}`
				: ''}. Retrying.
		{:else}
			Checked from outside every few seconds. Updated {ago(live.answeredAt, live.clock)}.
		{/if}
	</p>
</section>

{#each groups as [kind, checks] (kind)}
	<section aria-labelledby="kind-{kind}" class="mb-10">
		<h2 id="kind-{kind}" class="text-sm font-semibold text-text-strong">
			{KIND[kind]?.title ?? kind}
		</h2>
		{#if KIND[kind]}
			<p class="mt-0.5 text-sm text-text-soft">{KIND[kind].about}</p>
		{/if}
		<ul class="mt-2 divide-y divide-border border-y border-border">
			{#each checks as check (key(check.id, check.place))}
				<CheckRow
					{check}
					latest={live.nowByKey.get(key(check.id, check.place))}
					history={live.historyOf(check)}
					clock={live.clock}
					{local}
				/>
			{/each}
		</ul>
	</section>
{/each}

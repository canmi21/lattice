<script lang="ts">
	import type { StatusCheckRow, StatusNowRow } from '@canmi/status-schema';
	import { type State, segmentsOf, stateOf, uptimeOf } from '$lib/board';
	import type { HistoryRow } from '$lib/rows';
	import { ago } from '$lib/time';
	import UptimeBar from './uptime-bar.svelte';

	let {
		check,
		latest,
		history,
		clock,
		local,
	}: {
		check: StatusCheckRow;
		latest: StatusNowRow | undefined;
		history: HistoryRow[];
		clock: number;
		local: boolean;
	} = $props();

	const STATE: Record<State, { text: string; dot: string }> = {
		up: { text: 'Operational', dot: 'bg-green' },
		down: { text: 'Failing', dot: 'bg-red' },
		silent: { text: 'Probe silent', dot: 'bg-text-soft' },
		unknown: { text: 'No data yet', dot: 'bg-border-strong' },
	};

	const state = $derived(stateOf(latest, clock));
	const segments = $derived(segmentsOf(history, clock));
	const uptime = $derived(uptimeOf(segments));
</script>

<li class="py-5">
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<div class="min-w-0">
			<h3 class="font-mono text-sm font-medium text-text-strong">{check.id}</h3>
			<p class="truncate font-mono text-xs text-text-soft" title={check.target}>{check.target}</p>
		</div>
		<div class="flex items-center gap-3 text-sm">
			{#if latest && state !== 'unknown'}
				<span class="font-mono text-xs text-text-soft tabular-nums">
					{#if state === 'silent'}
						last heard {ago(latest.at.getTime(), clock)}
					{:else}
						{latest.durationMs} ms
					{/if}
				</span>
			{/if}
			<span class="inline-flex items-center gap-1.5 font-medium text-text">
				<span class="size-2 rounded-full {STATE[state].dot}" aria-hidden="true"></span>
				{STATE[state].text}
			</span>
		</div>
	</div>
	{#if state === 'down' && latest?.detail}
		<p class="mt-1 font-mono text-xs text-red-ink dark:text-red">{latest.detail}</p>
	{/if}
	<div class="mt-3">
		<UptimeBar {segments} {uptime} {local} />
	</div>
</li>

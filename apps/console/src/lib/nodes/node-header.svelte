<script lang="ts">
	/**
	 * A node's header: its code and whether it is heard, where it is and what it runs on, and the
	 * facts infra declares of it beside what its meter measures.
	 */
	import * as stylex from '@stylexjs/stylex';
	import type { Snippet } from 'svelte';
	import { duration } from '../chart/numbers.ts';
	import { moment } from '../chart/series.ts';
	import { ago, bytes, localTime } from '../format.ts';
	import type { MachineInfo } from '../host.ts';
	import { ROLES } from '../map/places.ts';
	import { type } from '../style.ts';
	import Badge from '../ui/badge.svelte';
	import PageHeader from '../ui/page-header.svelte';
	import { timeZone } from '../ui/time-zone.ts';
	import { architecture, uptime, type NodeRow } from './machine.ts';
	import { LIVENESS, capital } from './words.ts';

	let {
		row,
		info,
		now,
		actions,
	}: {
		row: NodeRow;
		/** The machine as its meter last said, where it has been read. */
		info?: MachineInfo;
		now: number;
		actions?: Snippet;
	} = $props();

	const zone = timeZone();
	const said = $derived(LIVENESS[row.state]);
	const up = $derived(uptime(info?.booted, now));
	const line = $derived(
		[
			row.place,
			info?.model,
			info?.kernel && `Linux ${info.kernel}`,
			info && `${info.cores} cores`,
			up !== undefined && `up ${duration(up)}`,
		]
			.filter(Boolean)
			.join(' · '),
	);
	const facts = $derived([
		{ label: 'Tier', value: capital(row.facts.tier) },
		{ label: 'Failure domain', value: row.facts.domain },
		{ label: 'Held until', value: row.facts.expiry ? String(row.facts.expiry) : 'Not set' },
		{ label: 'System', value: capital(row.facts.system) },
		{ label: 'Architecture', value: architecture(info?.kernel) ?? '–' },
		{ label: 'Memory', value: info ? bytes(info.memory) : '' },
		{ label: 'Swap', value: info ? (info.swap ? bytes(info.swap) : 'None') : '' },
		{ label: 'Storage', value: info?.storage ? bytes(info.storage) : '' },
		{ label: 'Booted', value: info?.booted ? moment(info.booted, zone) : '' },
	]);
</script>

<div class="flex flex-col gap-4">
	<PageHeader title={row.code} description={line} {actions}>
		{#snippet meta()}
			<Badge tone={said.tone}>{said.word}</Badge>
			<Badge tone="quiet">{ROLES[row.role]}</Badge>
			{#if row.heardAt}
				<span class={stylex.attrs(type.soft).class} title={localTime(row.heardAt, zone)}>
					heard {ago(row.heardAt, now)}
				</span>
			{:else}
				<span class={stylex.attrs(type.soft).class}>never heard by the relay</span>
			{/if}
		{/snippet}
	</PageHeader>
	<dl class="-mt-4 mb-2 flex flex-wrap gap-x-8 gap-y-3">
		{#each facts as fact (fact.label)}
			<div class="flex flex-col gap-0.5">
				<dt class={stylex.attrs(type.label).class}>{fact.label}</dt>
				<dd class={stylex.attrs(type.figure).class}>{fact.value || '–'}</dd>
			</div>
		{/each}
	</dl>
</div>

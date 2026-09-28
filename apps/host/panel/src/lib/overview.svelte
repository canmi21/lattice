<script lang="ts">
	/** The machine this host runs on, as the agent reads it. */
	import * as stylex from '@stylexjs/stylex';
	import { api, type MachineInfo, type Sample } from './api';
	import { bytes, frequency, span } from './format';
	import PageHeader from './page-header.svelte';
	import { surfaces, type } from './style/surfaces';

	let now: { info: MachineInfo; sample: Sample } | undefined = $state();
	let failure = $state('');

	$effect(() => {
		api
			.now()
			.then((answer) => (now = answer))
			.catch((error: Error) => (failure = error.message));
	});

	const facts = $derived.by(() => {
		if (!now) return [];
		const { info, sample } = now;
		const fastest = Math.max(0, ...info.max_frequencies.map((value) => value ?? 0));
		return [
			{ label: 'Machine', value: info.model ?? 'Unknown' },
			{ label: 'Kernel', value: info.kernel ?? 'Unknown' },
			{
				label: 'Processors',
				value: `${info.cores} cores${fastest ? `, up to ${frequency(fastest)}` : ''}`,
			},
			{ label: 'Memory', value: bytes(info.memory) },
			{ label: 'Up for', value: info.booted ? span(sample.at - info.booted) : 'Unknown' },
		];
	});
</script>

<PageHeader title="Overview" description="The machine this host runs on, as its agent reads it" />

{#if failure}
	<p class={stylex.attrs(type.muted).class}>{failure}</p>
{:else}
	<div class="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
		{#each facts as fact (fact.label)}
			<div class="flex flex-col gap-2 p-4 {stylex.attrs(surfaces.card).class}">
				<span class={stylex.attrs(type.label).class}>{fact.label}</span>
				<span class="truncate {stylex.attrs(type.heading).class}">{fact.value}</span>
			</div>
		{/each}
	</div>
{/if}

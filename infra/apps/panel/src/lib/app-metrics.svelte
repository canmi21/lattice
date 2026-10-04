<script lang="ts">
	/** One container as the meter samples it: processor, memory, network and disk, over a span. */
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import Card from './card.svelte';
	import AreaChart from './chart/area-chart.svelte';
	import Legend from './chart/legend.svelte';
	import type { Line } from './chart/series';
	import { bytes } from './format';
	import { Machine, SPANS, container, type Span } from './machine.svelte';
	import Segmented from './segmented.svelte';
	import { tone, type } from './style/surfaces';

	let { name, memoryMb }: { name: string; memoryMb: number | undefined } = $props();

	const machine = new Machine(untrack(() => container(name)));
	$effect(() => machine.start());
	$effect(() => {
		void machine.span;
		untrack(() => machine.refresh());
	});

	const line = (metric: string, label: string, color: string): Line => ({
		key: metric,
		label,
		color: `var(${color})`,
		points: machine.series(`${name}.${metric}`),
	});

	const percent = (share: number) => `${share.toFixed(share < 10 ? 1 : 0)}%`;
	const perSecond = (rate: number) => `${bytes(rate, rate < 1024 ? 0 : 1)}/s`;
	const ceiling = $derived(memoryMb === undefined ? undefined : memoryMb * 1024 * 1024);

	const charts = $derived([
		{
			title: 'Processor',
			description: 'Its share of the whole machine',
			lines: [line('cpu', 'Busy', '--nord8')],
			format: percent,
			ceiling: undefined,
			bytes: false,
		},
		{
			title: 'Memory',
			description: ceiling ? `In use, of its ${bytes(ceiling)} ceiling` : 'In use',
			lines: [line('memory', 'Used', '--nord9')],
			format: (amount: number) => bytes(amount),
			ceiling,
			bytes: true,
		},
		{
			title: 'Network',
			description: 'Through its own network',
			lines: [
				line('network.received', 'Received', '--nord14'),
				line('network.sent', 'Sent', '--nord15'),
			],
			format: perSecond,
			ceiling: undefined,
			bytes: true,
		},
		{
			title: 'Disk',
			description: 'Read from and written to the disks',
			lines: [line('disk.read', 'Read', '--nord7'), line('disk.written', 'Written', '--nord12')],
			format: perSecond,
			ceiling: undefined,
			bytes: true,
		},
	]);
</script>

<div class="mb-4 flex items-center justify-between gap-4">
	<p class={stylex.attrs(machine.failure ? tone.danger : type.muted).class}>
		{machine.failure || 'Sampled every second by the meter'}
	</p>
	<Segmented
		bind:value={machine.span}
		options={(Object.keys(SPANS) as Span[]).map((key) => ({ key, label: SPANS[key].label }))}
	/>
</div>

<div class="grid grid-cols-2 gap-5">
	{#each charts as chart (chart.title)}
		<Card title={chart.title} description={chart.description}>
			<div class="mb-3 min-h-5"><Legend lines={chart.lines} format={chart.format} /></div>
			{#if chart.lines.every((entry) => entry.points.length === 0)}
				<div class="flex h-[200px] items-center justify-center {stylex.attrs(type.muted).class}">
					Gathering…
				</div>
			{:else}
				<AreaChart
					lines={chart.lines}
					since={machine.window.since}
					until={machine.window.until}
					format={chart.format}
					ceiling={chart.ceiling}
					bytes={chart.bytes}
					band={machine.span !== 'live'}
					reveal={machine.span}
				/>
			{/if}
		</Card>
	{/each}
</div>

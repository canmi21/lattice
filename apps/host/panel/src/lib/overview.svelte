<script lang="ts">
	/** The machine this host runs on, as its agent samples it: now, and over the span chosen. */
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import Cpu from '@lucide/svelte/icons/cpu';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import MemoryStick from '@lucide/svelte/icons/memory-stick';
	import Thermometer from '@lucide/svelte/icons/thermometer';
	import Badge from './badge.svelte';
	import Card from './card.svelte';
	import AreaChart from './chart/area-chart.svelte';
	import Legend from './chart/legend.svelte';
	import type { Line } from './chart/series';
	import Cores from './cores.svelte';
	import { clockLine, clusterNames, zoneLabel, zoneOrder } from './labels';
	import { bytes, frequency, span } from './format';
	import { Machine, SPANS, type Span } from './machine.svelte';
	import PageHeader from './page-header.svelte';
	import Segmented from './segmented.svelte';
	import Stat from './stat.svelte';
	import { surfaces, tone, type } from './style/surfaces';

	const machine = new Machine();
	$effect(() => machine.start());
	$effect(() => {
		void machine.span;
		untrack(() => machine.refresh());
	});

	const value = (name: string) => machine.latest?.values[name];
	const info = $derived(machine.info);

	/** The colors a chart's lines take, in order, where no meaning picks one. */
	const PALETTE = ['--nord12', '--nord13', '--nord8', '--nord14', '--nord15', '--nord9', '--nord7'];
	const line = (key: string, label: string, color: string): Line => ({
		key,
		label,
		color: `var(${color})`,
		points: machine.series(key),
	});

	const zones = $derived(
		machine
			.names('temperature')
			.toSorted((a, b) =>
				zoneOrder(a.slice('temperature.'.length), b.slice('temperature.'.length)),
			),
	);
	const hottest = $derived(
		zones.toSorted((a, b) => (value(b) ?? 0) - (value(a) ?? 0))[0] as string | undefined,
	);

	const percent = (share: number) => `${share.toFixed(0)}%`;
	const perSecond = (rate: number) => `${bytes(rate, rate < 1024 ? 0 : 1)}/s`;
	const degrees = (celsius: number) => `${celsius.toFixed(0)}°C`;

	const charts = $derived([
		{
			title: 'Processor',
			description: 'Share of all cores busy, and waiting on a disk',
			lines: [line('cpu.usage', 'Busy', '--nord8'), line('cpu.iowait', 'Waiting', '--nord13')],
			format: percent,
			ceiling: 100,
			bytes: false,
		},
		{
			title: 'Memory',
			description: `In use, cached, and swapped, of ${info ? bytes(info.memory) : '…'}`,
			lines: [
				line('memory.used', 'Used', '--nord9'),
				line('memory.cached', 'Cached', '--nord7'),
				line('swap.used', 'Swap', '--nord12'),
			],
			format: (amount: number) => bytes(amount),
			ceiling: info?.memory,
			bytes: true,
		},
		{
			title: 'Network',
			description: 'Through the interfaces that leave the machine',
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
			description: 'Read from and written to the whole disks',
			lines: [line('disk.read', 'Read', '--nord7'), line('disk.written', 'Written', '--nord12')],
			format: perSecond,
			ceiling: undefined,
			bytes: true,
		},
		{
			title: 'Temperature',
			description: 'Each thermal zone the board reports',
			lines: zones.map((zone, index) =>
				line(zone, zoneLabel(zone.slice('temperature.'.length)), PALETTE[index % PALETTE.length]!),
			),
			format: degrees,
			ceiling: undefined,
			bytes: false,
		},
		{
			title: 'Load',
			description: 'Tasks wanting a core, averaged over 1, 5 and 15 minutes',
			lines: [
				line('load.1', '1 min', '--nord8'),
				line('load.5', '5 min', '--nord9'),
				line('load.15', '15 min', '--nord10'),
			],
			format: (load: number) => load.toFixed(2),
			ceiling: undefined,
			bytes: false,
		},
	]);

	const cores = $derived(machine.names('cpu.core').filter((name) => name.endsWith('.usage')));
	const clusters = $derived(info?.clusters ?? []);
	const fastest = $derived(Math.max(0, ...clusters.map((cluster) => cluster.max_frequency ?? 0)));
	/** Each core's cluster name, by the core's number. */
	const clusterOf = $derived.by(() => {
		const names = clusterNames(clusters);
		const of: (string | undefined)[] = [];
		clusters.forEach((cluster, index) =>
			cluster.cores.forEach((core) => (of[core] = names[index])),
		);
		return of;
	});
	const clock = $derived(clockLine(clusters, (first) => value(`cpu.frequency.${first}`)));
	const up = $derived(
		info?.booted && machine.latest ? span(machine.latest.at - info.booted) : undefined,
	);
	const storageUsed = $derived(value('storage.used'));
</script>

<PageHeader
	title={info?.model ?? 'This machine'}
	description={info
		? `${info.kernel ?? 'Unknown kernel'} · ${info.cores} cores${fastest ? ` up to ${frequency(fastest)}` : ''} · ${bytes(info.memory)} memory`
		: 'Reading the machine…'}
>
	{#snippet meta()}
		{#if up}<Badge tone="good">Up {up}</Badge>{/if}
	{/snippet}
	{#snippet actions()}
		<Segmented
			bind:value={machine.span}
			options={(Object.keys(SPANS) as Span[]).map((key) => ({ key, label: SPANS[key].label }))}
		/>
	{/snippet}
</PageHeader>

{#if machine.failure}
	<p class="mb-5 {stylex.attrs(tone.danger).class}">{machine.failure}</p>
{/if}

<div class="mb-6 grid grid-cols-4 gap-4">
	<Stat
		label="Processor"
		icon={Cpu}
		value={value('cpu.usage') === undefined ? '–' : percent(value('cpu.usage')!)}
		detail={value('load.1') === undefined ? undefined : `load ${value('load.1')!.toFixed(2)}`}
		share={(value('cpu.usage') ?? 0) / 100}
		color="var(--nord8)"
		recent={machine.recent('cpu.usage')}
		ceiling={100}
	/>
	<Stat
		label="Memory"
		icon={MemoryStick}
		value={value('memory.used') === undefined ? '–' : bytes(value('memory.used')!)}
		detail={info ? `of ${bytes(info.memory)}` : undefined}
		share={info ? (value('memory.used') ?? 0) / info.memory : undefined}
		color="var(--nord9)"
		recent={machine.recent('memory.used')}
		ceiling={info?.memory}
	/>
	<Stat
		label="Temperature"
		icon={Thermometer}
		value={hottest ? degrees(value(hottest)!) : '–'}
		detail={hottest
			? `hottest, ${zoneLabel(hottest.slice('temperature.'.length))}`
			: 'Not reported here'}
		color="var(--nord12)"
		recent={hottest ? machine.recent(hottest) : []}
	/>
	<Stat
		label="Storage"
		icon={HardDrive}
		value={storageUsed === undefined ? '–' : bytes(storageUsed)}
		detail={info?.storage ? `of ${bytes(info.storage)}` : undefined}
		share={info?.storage && storageUsed !== undefined ? storageUsed / info.storage : undefined}
		color="var(--nord14)"
		recent={machine.recent('storage.used')}
	/>
</div>

<div class="mb-6 grid grid-cols-2 gap-5">
	{#each charts as chart (chart.title)}
		<Card title={chart.title} description={chart.description}>
			<div class="mb-3 min-h-5"><Legend lines={chart.lines} format={chart.format} /></div>
			{#if chart.lines.length === 0 || chart.lines.every((entry) => entry.points.length === 0)}
				<div class="flex h-[200px] items-center justify-center {stylex.attrs(type.muted).class}">
					{chart.lines.length === 0 ? 'Not reported on this machine' : 'Gathering…'}
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

<Card title="Cores" description="Each core this second, and the clock its cluster runs at">
	{#snippet actions()}
		<span class={stylex.attrs(type.heading).class}>{clock}</span>
	{/snippet}
	<Cores
		usage={cores.map((name) => value(name) ?? 0)}
		clusters={cores.map((_, core) => clusterOf[core])}
	/>
</Card>

<div class="mt-6 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
	{#each [{ label: 'Machine', value: info?.model ?? 'Unknown' }, { label: 'Kernel', value: info?.kernel ?? 'Unknown' }, { label: 'Swap', value: info ? bytes(info.swap) : '–' }, { label: 'Booted', value: info?.booted ? new Date(info.booted * 1000).toLocaleString() : 'Unknown' }] as fact (fact.label)}
		<div class="flex flex-col gap-1.5 px-5 py-4 {stylex.attrs(surfaces.card).class}">
			<span class={stylex.attrs(type.label).class}>{fact.label}</span>
			<span class="truncate {stylex.attrs(type.heading).class}">{fact.value}</span>
		</div>
	{/each}
</div>

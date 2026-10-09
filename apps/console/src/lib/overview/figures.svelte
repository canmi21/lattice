<script lang="ts">
	/**
	 * The fleet in four figures, as a strip or a column beside the map: nodes heard and apps
	 * running, from the live store so they move as the nodes do; deploys in the last day and how
	 * long one takes, from the runs the page streams. A figure holds a faint bar until its read
	 * lands. Apps count those `keep` keeps, and the nodes' figure stands only where `nodes` is set,
	 * the nodes being infra's. See spec/console/overview.md, "The map is the page's whole picture".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { line, radius, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import { duration, percent } from '../chart/numbers.ts';
	import type { Live } from '../live.svelte.ts';
	import { PLACES } from '../map/places.ts';
	import { liveness } from '../node.ts';
	import { type } from '../style.ts';
	import type { Figures } from './deploys.ts';

	let {
		live,
		deploys,
		keep = () => true,
		nodes = true,
		stacked = false,
	}: {
		live: Live;
		deploys: Promise<{ figures: Figures }>;
		keep?: (app: string) => boolean;
		nodes?: boolean;
		/** One figure under another, as a column beside the map, rather than a row. */
		stacked?: boolean;
	} = $props();

	const TOTAL = Object.keys(PLACES).length;
	const held = $derived(Object.values(live.view.nodes));
	const known = $derived(held.length > 0);
	const heard = $derived(held.filter((one) => liveness(one.heard_at, live.now) === 'live').length);
	const apps = $derived.by(() => {
		const kept = held.flatMap((one) => one.snapshot.apps).filter((app) => keep(app.name));
		return { running: kept.filter((app) => app.running).length, total: kept.length };
	});
	const seconds = (ms: number | null) => (ms === null ? '–' : duration(ms / 1000));

	const styles = stylex.create({
		figure: {
			fontSize: '1.5rem', // unnamed: a figure a step under the tile's, the ladder stopping below
			fontWeight: weight.semibold,
			letterSpacing: '-0.02em', // unnamed: a display size drawn a little tight
			lineHeight: line.none,
			fontVariantNumeric: 'tabular-nums',
			color: 'var(--color-text-strong)',
		},
		placeholder: {
			backgroundColor: 'color-mix(in srgb, var(--color-raised) 45%, transparent)',
			borderRadius: radius.md,
		},
		/** A hairline between two figures, the strip's only rule. */
		apart: {
			borderLeftWidth: { default: '1px', ':first-child': '0' },
			borderLeftStyle: 'solid',
			borderLeftColor: 'var(--color-line-faint)',
		},
		under: {
			borderTopWidth: { default: '1px', ':first-child': '0' },
			borderTopStyle: 'solid',
			borderTopColor: 'var(--color-line-faint)',
		},
	});
</script>

{#snippet figure(label: string, value: string | number | undefined, unit?: string)}
	<div
		class="flex min-w-0 flex-col justify-center gap-2 px-5 py-4 {stylex.attrs(
			stacked ? styles.under : styles.apart,
		).class}"
	>
		<span class={stylex.attrs(type.label).class}>{label}</span>
		{#if value === undefined}
			<span class="h-6 w-14 {stylex.attrs(styles.placeholder).class}" aria-busy="true"></span>
		{:else}
			<span class="flex items-baseline gap-1.5">
				<span class={stylex.attrs(styles.figure).class}>{value}</span>
				{#if unit}<span class="truncate {stylex.attrs(type.soft).class}">{unit}</span>{/if}
			</span>
		{/if}
	</div>
{/snippet}

<div
	class="grid {stacked
		? 'h-full grid-cols-2 lg:grid-cols-1 lg:grid-rows-4'
		: `grid-cols-2 ${nodes ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}"
>
	{#if nodes}
		{@render figure('Nodes heard', known ? heard : undefined, `of ${TOTAL}`)}
	{/if}
	{@render figure('Apps running', known ? apps.running : undefined, `of ${apps.total}`)}
	{#await deploys}
		{@render figure('Deploys, 24 h', undefined)}
		{@render figure('Median deploy, 30 d', undefined)}
	{:then { figures }}
		{@render figure(
			'Deploys, 24 h',
			figures.day,
			figures.rate === null ? undefined : `${percent(figures.rate)} succeeded`,
		)}
		{@render figure(
			'Median deploy, 30 d',
			seconds(figures.median),
			figures.p95 === null ? undefined : `p95 ${seconds(figures.p95)}`,
		)}
	{/await}
</div>

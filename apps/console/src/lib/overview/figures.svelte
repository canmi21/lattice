<script lang="ts">
	/**
	 * The fleet in four figures along the map's foot: each its name, the figure and what it is out
	 * of on one line, and at its right a small drawing of it -- a pip a node, a ring of the apps
	 * running, a ring of the deploys that succeeded, the last deploys' durations as a line. A figure
	 * holds a faint bar until its read lands; apps count those `keep` keeps, and the nodes' figure
	 * stands only where `nodes` is set. See spec/console/overview.md, "The figures are a line and a
	 * drawing each".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Snippet } from 'svelte';
	import Gauge from '../chart/gauge.svelte';
	import Sparkline from '../chart/sparkline.svelte';
	import type { Live } from '../live.svelte.ts';
	import { nameOf } from '../map/places.ts';
	import { liveness } from '../node.ts';
	import { CODES } from '../nodes/facts.ts';
	import { type } from '../style.ts';
	import type { Figures } from './deploys.ts';

	let {
		live,
		deploys,
		keep = () => true,
		nodes = true,
	}: {
		live: Live;
		/** The view's runs counted, read already or on their way. */
		deploys: { figures: Figures } | Promise<{ figures: Figures }>;
		keep?: (app: string) => boolean;
		nodes?: boolean;
	} = $props();

	const held = $derived(Object.values(live.view.nodes));
	const known = $derived(held.length > 0);
	const heard = $derived(
		CODES.map((code) => {
			const one = live.view.nodes[code];
			return { code, heard: one ? liveness(one.heard_at, live.now) !== 'gone' : false };
		}),
	);
	const apps = $derived.by(() => {
		const kept = held.flatMap((one) => one.snapshot.apps).filter((app) => keep(app.name));
		return { running: kept.filter((app) => app.running).length, total: kept.length };
	});
	/** A span of milliseconds in its one largest unit: `58s`, `26m`, `1.4h`. */
	function brief(ms: number | null): string {
		if (ms === null) return '–';
		const seconds = ms / 1000;
		if (seconds < 60) return `${Math.round(seconds)}s`;
		if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
		return `${(seconds / 3600).toFixed(1)}h`;
	}

	const styles = stylex.create({
		figure: {
			color: 'var(--color-text-strong)',
			fontSize: '1.25rem', // unnamed: a figure a step over the body, the ladder stopping below
			fontWeight: weight.semibold,
			fontVariantNumeric: 'tabular-nums',
		},
		rest: { color: 'var(--color-text-muted)', fontSize: text.px13 },
		placeholder: {
			backgroundColor: 'color-mix(in srgb, var(--color-raised) 45%, transparent)',
			borderRadius: radius.md,
		},
		heard: { backgroundColor: 'var(--color-primary)' },
		gone: { backgroundColor: 'var(--color-danger)' },
		/** A hairline between two figures, the strip's only rule. */
		apart: {
			borderLeftWidth: { default: '1px', ':first-child': '0' },
			borderLeftStyle: 'solid',
			borderLeftColor: 'var(--color-line-faint)',
		},
	});
</script>

{#snippet cell(label: string, figure: string | undefined, rest: string | undefined, art?: Snippet)}
	<div class="flex min-w-0 items-center gap-4 px-5 py-4 {stylex.attrs(styles.apart).class}">
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			<span class={stylex.attrs(type.label).class}>{label}</span>
			{#if figure === undefined}
				<span class="my-1 h-5 w-16 {stylex.attrs(styles.placeholder).class}" aria-busy="true"
				></span>
			{:else}
				<span class="flex items-baseline gap-1.5 whitespace-nowrap">
					<span class={stylex.attrs(type.shell, styles.figure).class}>{figure}</span>
					{#if rest}<span class={stylex.attrs(type.shell, styles.rest).class}>{rest}</span>{/if}
				</span>
			{/if}
		</div>
		{#if figure !== undefined}{@render art?.()}{/if}
	</div>
{/snippet}

{#snippet pips()}
	<span class="grid shrink-0 grid-cols-4 gap-1.5" role="img" aria-label="Each node, heard or not">
		{#each heard as one (one.code)}
			<span
				class="size-1.5 rounded-full {stylex.attrs(one.heard ? styles.heard : styles.gone).class}"
				title="{nameOf(one.code).full}: {one.heard ? 'heard' : 'not heard'}"
			></span>
		{/each}
	</span>
{/snippet}

{#snippet running()}
	<Gauge
		share={apps.total ? apps.running / apps.total : undefined}
		size={28}
		label="{apps.running} of {apps.total} apps running"
	/>
{/snippet}

<div class="grid grid-cols-2 {nodes ? 'md:grid-cols-4' : 'md:grid-cols-3'}">
	{#if nodes}
		{@render cell(
			'Nodes',
			known ? String(heard.filter((one) => one.heard).length) : undefined,
			`/ ${CODES.length}`,
			pips,
		)}
	{/if}
	{@render cell('Apps', known ? String(apps.running) : undefined, `/ ${apps.total}`, running)}
	{#await deploys}
		{@render cell('Deploys', undefined, undefined)}
		{@render cell('Deploy time', undefined, undefined)}
	{:then { figures }}
		{#snippet succeeded()}
			<Gauge
				share={figures.rate ?? undefined}
				size={28}
				color="var(--color-good)"
				label={figures.rate === null
					? 'None finished'
					: `${Math.round(figures.rate * 100)}% succeeded`}
			/>
		{/snippet}
		{#snippet spread()}
			<span class="w-16 shrink-0">
				<Sparkline values={figures.durations} height={24} label="The last deploys' durations" />
			</span>
		{/snippet}
		{@render cell('Deploys', String(figures.day), '24h', succeeded)}
		{@render cell(
			'Deploy time',
			brief(figures.median),
			figures.p95 === null ? undefined : `p95 ${brief(figures.p95)}`,
			figures.durations.length > 1 ? spread : undefined,
		)}
	{/await}
</div>

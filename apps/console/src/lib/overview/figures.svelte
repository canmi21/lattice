<script lang="ts">
	/**
	 * The fleet in four figures along the map's foot, four abreast or two and two by the strip's
	 * width, a narrow cell giving up its drawing, then its second figure: its name, the figure and
	 * what it is out of, and a small drawing -- a pip a node, a ring of the apps running, a ring of
	 * the deploys that succeeded, the last durations as a line. A figure holds a faint bar until its
	 * read lands; apps count those `keep` keeps; the nodes' figure stands only where `nodes` is set.
	 * See spec/console/overview.md, "The figures are a line and a drawing each".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Snippet } from 'svelte';
	import Gauge from '../chart/gauge.svelte';
	import Sparkline from '../chart/sparkline.svelte';
	import type { Live } from '../live.svelte.ts';
	import { nameOf } from '../map/places.ts';
	import { shown } from '../map/marks.ts';
	import { stateOf } from '../node.ts';
	import { CODES } from '../nodes/facts.ts';
	import { type } from '../style.ts';
	import type { State } from '../wire.ts';
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
			const state = stateOf(live.view.nodes[code], live.now);
			return { code, state, shown: shown(state) };
		}),
	);
	const apps = $derived.by(() => {
		const kept = held.flatMap((one) => one.snapshot?.apps ?? []).filter((app) => keep(app.name));
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
		live: { backgroundColor: 'var(--color-primary)' },
		leaving: { backgroundColor: 'var(--color-warn)' },
		waiting: { backgroundColor: 'var(--color-text-muted)' },
		gone: { backgroundColor: 'var(--color-danger)' },
		/** A cell on the card's own ground, over the strip's rule, which shows through the gaps. */
		cell: { backgroundColor: 'var(--color-surface)' },
		/** The rule between the cells, a pixel's gap a side, so two rows have one between them too. */
		rules: { backgroundColor: 'var(--color-line-faint)' },
	});

	/** A pip's title, each node's state as the relay says it; a late one is heard. */
	const SAID: Record<State, string> = {
		live: 'heard',
		late: 'heard',
		upgrading: 'upgrading',
		restarting: 'restarting',
		waiting: 'waiting',
		gone: 'not heard',
	};
</script>

{#snippet cell(
	label: string,
	figure: string | undefined,
	rest: string | undefined,
	art?: Snippet,
	/** The rest is a second figure, which a narrow cell leaves out: `p95 9m`. */
	minor = false,
)}
	<!-- Each cell measures itself: its drawing goes first as it narrows, then a second figure. -->
	<div
		class="@container/cell flex min-w-0 items-center gap-4 px-5 py-4 {stylex.attrs(styles.cell)
			.class}"
	>
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			<span class={stylex.attrs(type.label).class}>{label}</span>
			{#if figure === undefined}
				<span class="my-1 h-5 w-16 {stylex.attrs(styles.placeholder).class}" aria-busy="true"
				></span>
			{:else}
				<!-- What it is out of sits against the figure, `102/105`, as the card writes it; a word
				     such as `24h` stands a step apart. -->
				<span
					class="flex items-baseline whitespace-nowrap {rest?.startsWith('/') ? '' : 'gap-1.5'}"
				>
					<span class={stylex.attrs(type.shell, styles.figure).class}>{figure}</span>
					{#if rest}<span
							class="{minor ? 'hidden @min-[9rem]/cell:inline' : ''} {stylex.attrs(
								type.shell,
								styles.rest,
							).class}">{rest}</span
						>{/if}
				</span>
			{/if}
		</div>
		{#if figure !== undefined && art}
			<span class="hidden shrink-0 @min-[12rem]/cell:flex">{@render art()}</span>
		{/if}
	</div>
{/snippet}

{#snippet pips()}
	<span class="grid shrink-0 grid-cols-4 gap-1.5" role="img" aria-label="Each node, heard or not">
		{#each heard as one (one.code)}
			<span
				class="size-1.5 rounded-full {stylex.attrs(styles[one.shown]).class}"
				title="{nameOf(one.code).full}: {SAID[one.state]}"
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

<!-- Four abreast where the strip has the room, two and two where it does not: the strip's own
     width decides, not the window's. -->
<div class="@container">
	<div
		class="grid grid-cols-2 gap-px {nodes ? '@3xl:grid-cols-4' : '@2xl:grid-cols-3'} {stylex.attrs(
			styles.rules,
		).class}"
	>
		{#if nodes}
			{@render cell(
				'Nodes',
				known ? String(heard.filter((one) => one.shown === 'live').length) : undefined,
				`/${CODES.length}`,
				pips,
			)}
		{/if}
		{@render cell('Apps', known ? String(apps.running) : undefined, `/${apps.total}`, running)}
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
				true,
			)}
		{/await}
	</div>
</div>

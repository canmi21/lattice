<script lang="ts">
	/**
	 * The week, a line a node: its flag with the dot that says how it is, the part of its place that
	 * tells it apart, and what it did along the line. Over a day a mark is a run, a tick done, a blue
	 * one going and a red dot failed, and one run's marks stand one above another, lit together
	 * under the pointer; over a week an hour is a cell, as dark as it was busy and red where a run
	 * failed in it. In a view without nodes the lines are its busiest apps instead. See
	 * spec/console/overview.md, "The week is a line a node".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { localTime } from '../format.ts';
	import type { Live } from '../live.svelte.ts';
	import { nameOf, partOf } from '../map/places.ts';
	import { CODES } from '../nodes/facts.ts';
	import { scoped } from '../scope/context.ts';
	import { displayOf } from '../scope/scope.ts';
	import { type } from '../style.ts';
	import { timeZone } from '../ui/time-zone.ts';
	import HealthFlag from './health-flag.svelte';
	import { healthOf } from './health.ts';
	import type { Step } from './moving.ts';
	import { type Cell, DAY, HOUR, type Mark, cells, marks } from './timeline.ts';
	import { OUTCOME } from './words.ts';

	let {
		live,
		steps,
		keep,
		nodes = true,
		span = DAY,
	}: {
		live: Live;
		/** Every step known, history and live together. */
		steps: Step[];
		keep: (app: string) => boolean;
		/** A line a node; else a line an app, its busiest first. */
		nodes?: boolean;
		/** How far back the line reaches, in milliseconds: a day or a week. */
		span?: number;
	} = $props();

	const { to, node: toNode, app: toApp } = scoped();
	const zone = timeZone();

	/** Apps' lines at most, in a view without nodes. */
	const APPS = 8;
	const COLUMNS = 'grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-4';

	/** Over more than a day, an hour a cell; over a day, a mark a run. */
	const hourly = $derived(span > DAY);
	const of = $derived(Math.round(span / HOUR));

	/** Where the axis is ticked, as shares of the span, and what each tick says. */
	const ticks = $derived.by((): (readonly [number, string])[] => {
		if (!hourly) {
			return [
				[0, '24h'],
				[0.25, '18h'],
				[0.5, '12h'],
				[0.75, '6h'],
				[1, 'now'],
			];
		}
		const days = Math.round(span / DAY);
		return Array.from({ length: days + 1 }, (_, at) => [
			at / days,
			at === days ? 'now' : `${days - at}d`,
		]);
	});

	const drawn = $derived(
		marks(
			steps.filter((step) => keep(step.app)),
			live.now,
			span,
		),
	);
	/** The run a pointer is on, whose marks on every line stand out. */
	let lit: number | undefined = $state();

	interface Line {
		key: string;
		href: string;
		marks: Mark[];
		code?: string;
		label: string;
		/** The whole name, on the label's hover. */
		whole: string;
	}

	const lines = $derived.by((): Line[] => {
		if (nodes) {
			return CODES.map((code) => ({
				key: code,
				href: toNode(code),
				marks: drawn.filter((mark) => mark.node === code),
				code,
				label: partOf(code),
				whole: nameOf(code).full,
			}));
		}
		const busiest = [
			...Map.groupBy(
				drawn.flatMap((mark) => mark.apps.map((app) => ({ app, mark }))),
				(one) => one.app,
			),
		]
			.toSorted(([, a], [, b]) => b.length - a.length)
			.slice(0, APPS);
		return busiest.map(([app, its]) => ({
			key: app,
			href: toApp(app),
			marks: its.map((one) => one.mark),
			label: displayOf(app),
			whole: displayOf(app),
		}));
	});

	/** How long it took, in its one largest unit: ` in 42s`, ` in 3m`. */
	function took(mark: Mark): string {
		if (!mark.finished_at) return '';
		const seconds = Math.round((Date.parse(mark.finished_at) - Date.parse(mark.started_at)) / 1000);
		if (seconds < 60) return ` in ${seconds}s`;
		if (seconds < 3600) return ` in ${Math.round(seconds / 60)}m`;
		return ` in ${Math.round(seconds / 3600)}h`;
	}
	const appsOf = (mark: Mark) => mark.apps.map(displayOf).join(', ');
	const said = (mark: Mark) =>
		`${appsOf(mark)}: ${OUTCOME[mark.outcome]}, ${localTime(mark.started_at, zone)}${took(mark)}` +
		(mark.detail ? `\n${mark.detail}` : '');
	/** A cell's hover: each of its runs. */
	const told = (cell: Cell) => cell.marks.map(said).join('\n');
	const hrefOf = (mark: Mark) =>
		mark.run === undefined ? `${toNode(mark.node)}?tab=events` : to(`/deployments/${mark.run}`);
	const pct = (share: number) => `${(share * 100).toFixed(3)}%`;

	const styles = stylex.create({
		label: { color: 'var(--color-text)', fontSize: text.px13 },
		/** The line itself, a hairline through the middle where the marks stand. */
		track: { backgroundColor: 'var(--color-line)' },
		done: { backgroundColor: 'color-mix(in srgb, var(--color-text) 55%, transparent)' },
		going: { backgroundColor: 'var(--color-busy)' },
		failed: {
			backgroundColor: 'var(--color-danger)',
			boxShadow: '0 0 0 2px var(--color-surface)',
		},
		/** A cell as dark as its hour was busy: one run, two or three, and more. */
		one: { backgroundColor: 'color-mix(in srgb, var(--color-text) 30%, transparent)' },
		few: { backgroundColor: 'color-mix(in srgb, var(--color-text) 55%, transparent)' },
		many: { backgroundColor: 'color-mix(in srgb, var(--color-text) 85%, transparent)' },
		cellFailed: { backgroundColor: 'var(--color-danger)' },
		/** Another run's marks step back while one is pointed at. */
		dim: { opacity: 0.25 },
		mark: { transitionProperty: 'opacity', transitionDuration: duration.base },
		tick: { backgroundColor: 'var(--color-text-muted)' },
		axis: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		empty: { color: 'var(--color-text-muted)', fontSize: text.px13 },
	});

	const shade = (cell: Cell) =>
		cell.outcome === 'failed'
			? styles.cellFailed
			: cell.outcome === 'running'
				? styles.going
				: cell.marks.length > 3
					? styles.many
					: cell.marks.length > 1
						? styles.few
						: styles.one;
</script>

{#snippet mark(one: Mark)}
	{@const faded = lit !== undefined && one.run !== lit}
	{#if one.outcome === 'failed'}
		<a
			href={hrefOf(one)}
			title={said(one)}
			class="absolute top-1/2 z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full {stylex.attrs(
				styles.mark,
				styles.failed,
				faded && styles.dim,
			).class}"
			style:left={pct(one.from)}
			onpointerenter={() => (lit = one.run)}
			onpointerleave={() => (lit = undefined)}
		></a>
	{:else}
		<!-- At least two pixels wide, so a run of a minute stands as a tick, and as long as it took
		     where that is longer. -->
		<a
			href={hrefOf(one)}
			title={said(one)}
			class="absolute top-1/2 h-3 min-w-0.5 -translate-y-1/2 rounded-[1px] {stylex.attrs(
				styles.mark,
				one.outcome === 'running' ? styles.going : styles.done,
				faded && styles.dim,
			).class}"
			style:left={pct(one.from)}
			style:width={pct(Math.max(0, one.to - one.from))}
			onpointerenter={() => (lit = one.run)}
			onpointerleave={() => (lit = undefined)}
		></a>
	{/if}
{/snippet}

{#snippet cell(one: Cell)}
	{@const only = one.marks.length === 1 ? one.marks[0] : undefined}
	<!-- An hour's width less a pixel, so two busy hours side by side still read as two. -->
	<a
		href={only ? hrefOf(only) : to('/deployments')}
		title={told(one)}
		class="absolute top-1/2 h-3 -translate-y-1/2 rounded-[1px] {stylex.attrs(shade(one)).class}"
		style:left={pct(one.index / one.of)}
		style:width="calc({pct(1 / one.of)} - 1px)"
	></a>
{/snippet}

{#if nodes || lines.length}
	<div class="flex flex-col">
		{#each lines as line (line.key)}
			<div class="h-7 {COLUMNS}">
				<a
					href={line.href}
					title={line.whole}
					class="flex min-w-0 items-center gap-2.5 {stylex.attrs(styles.label).class}"
				>
					{#if line.code}
						<HealthFlag
							code={line.code}
							told={healthOf(live.view.nodes[line.code], live.now)}
							size={14}
						/>
					{/if}
					<span class="truncate">{line.label}</span>
				</a>
				<div class="relative h-full">
					<span
						aria-hidden="true"
						class="absolute inset-x-0 top-1/2 h-px {stylex.attrs(styles.track).class}"
					></span>
					{#if hourly}
						{#each cells(line.marks, of) as one (one.key)}
							{@render cell(one)}
						{/each}
					{:else}
						{#each line.marks as one (one.key)}
							{@render mark(one)}
						{/each}
					{/if}
				</div>
			</div>
		{/each}
		<!-- The axis, under the lines and in their column: ticked, never ruled through them. -->
		<div class="h-6 {COLUMNS}">
			<span></span>
			<div class="relative h-full">
				{#each ticks as [at, word] (word)}
					<span
						aria-hidden="true"
						class="absolute top-0 h-1 w-px {stylex.attrs(styles.tick).class}"
						style:left={pct(at)}
					></span>
					<span
						class="absolute top-1.5 {at === 0
							? ''
							: at === 1
								? '-translate-x-full'
								: '-translate-x-1/2'} {stylex.attrs(type.shell, styles.axis).class}"
						style:left={pct(at)}>{word}</span
					>
				{/each}
			</div>
		</div>
	</div>
{:else}
	<p class="flex min-h-40 items-center justify-center {stylex.attrs(styles.empty).class}">
		Nothing deployed in this span
	</p>
{/if}

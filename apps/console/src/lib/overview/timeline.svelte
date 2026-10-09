<script lang="ts">
	/**
	 * The week, a line a node, as a status page draws one: its flag with the dot that says how it
	 * is, the part of its place that tells it apart, and a row of slots, an hour each over a week
	 * and a quarter over a day -- grey where nothing ran, green done, blue going, red where a run
	 * failed. Under the rows, where the span starts and that it ends now. In a view without nodes
	 * the lines are its busiest apps instead. See spec/console/overview.md, "The week is a line a
	 * node".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { localTime } from '../format.ts';
	import type { Live } from '../live.svelte.ts';
	import { nameOf, partOf } from '../map/places.ts';
	import { CODES } from '../nodes/facts.ts';
	import { scoped } from '../scope/context.ts';
	import { displayOf } from '../scope/scope.ts';
	import { timeZone } from '../ui/time-zone.ts';
	import HealthFlag from './health-flag.svelte';
	import { healthOf } from './health.ts';
	import type { Step } from './moving.ts';
	import { type Cell, DAY, type Mark, marks, slots, slotsIn } from './timeline.ts';
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

	const of = $derived(slotsIn(span));
	/** Where the row starts, under its first slot. */
	const since = $derived(span > DAY ? `${Math.round(span / DAY)} days ago` : '24 hours ago');

	const drawn = $derived(
		marks(
			steps.filter((step) => keep(step.app)),
			live.now,
			span,
		),
	);

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
	/** A slot's hover: each of its runs. */
	const told = (cell: Cell) => cell.marks.map(said).join('\n');
	const hrefOf = (mark: Mark) =>
		mark.run === undefined ? `${toNode(mark.node)}?tab=events` : to(`/deployments/${mark.run}`);

	const styles = stylex.create({
		label: { color: 'var(--color-text)', fontSize: text.px13 },
		/** A slot nothing ran in: a step off the card, as a status page's empty day is. */
		empty: { backgroundColor: 'color-mix(in srgb, var(--color-text) 9%, transparent)' },
		succeeded: { backgroundColor: 'var(--color-good)' },
		running: { backgroundColor: 'var(--color-busy)' },
		failed: { backgroundColor: 'var(--color-danger)' },
		slot: {
			opacity: { default: 1, ':hover': 0.7 },
			transitionProperty: 'opacity',
			transitionDuration: duration.base,
		},
		axis: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		none: { color: 'var(--color-text-muted)', fontSize: text.px13 },
	});
</script>

{#snippet slot(one: Cell | undefined)}
	{#if one}
		{@const only = one.marks.length === 1 ? one.marks[0] : undefined}
		<a
			href={only ? hrefOf(only) : to('/deployments')}
			title={told(one)}
			class="min-w-0 flex-1 rounded-[2px] {stylex.attrs(styles.slot, styles[one.outcome]).class}"
		></a>
	{:else}
		<span class="min-w-0 flex-1 rounded-[2px] {stylex.attrs(styles.empty).class}"></span>
	{/if}
{/snippet}

{#if nodes || lines.length}
	<div class="flex flex-col gap-1.5">
		{#each lines as line (line.key)}
			<div class="h-6 {COLUMNS}">
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
				<!-- One slot a span's hour or quarter, a pixel apart, as a status page's days are. -->
				<div class="flex h-5 gap-px">
					{#each slots(line.marks, of) as one, index (index)}
						{@render slot(one)}
					{/each}
				</div>
			</div>
		{/each}
		<div class="{COLUMNS} pt-1">
			<span></span>
			<div class="flex justify-between {stylex.attrs(styles.axis).class}">
				<span>{since}</span>
				<span>Now</span>
			</div>
		</div>
	</div>
{:else}
	<p class="flex min-h-40 items-center justify-center {stylex.attrs(styles.none).class}">
		Nothing deployed in this span
	</p>
{/if}

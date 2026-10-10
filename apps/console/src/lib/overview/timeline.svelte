<script lang="ts">
	/**
	 * The week, a line a node, as a status page draws one: its flag and its health's dot, the part of
	 * its place that tells it apart, and a row of slots -- grey where nothing ran, white done, blue
	 * going, amber partly failed, red failed -- each as dark as its runs rank among its color's,
	 * saying when on its hover. The slots stretch to fill the row, else there are more or fewer. In a
	 * view without nodes the lines are its busiest apps. See spec/console/overview.md, "The week is a
	 * line a node".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text } from '@canmi/kit/tokens/vocabulary.stylex';
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
	import {
		type Cell,
		DAY,
		type Mark,
		SHADES,
		fit,
		marks,
		shades,
		slots,
		slotsIn,
	} from './timeline.ts';
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

	/** The row's width once the browser has laid it out; the server draws the usual count. */
	let width = $state(0);
	const layout = $derived(width ? fit(span, width) : undefined);
	const of = $derived(layout?.of ?? slotsIn(span));

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
	}); /** Each line with its slots, and the shade of every filled slot among them all. */
	const rows = $derived(lines.map((line) => ({ line, slots: slots(line.marks, of) })));
	const shaded = $derived(shades(rows.flatMap((row) => row.slots)));

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
	const clock = (ms: number) => localTime(new Date(ms).toISOString(), zone);
	/** A slot's hover: the time it covers, then each of its runs. */
	function told(cell: Cell): string {
		const start = live.now - span + (cell.index * span) / cell.of;
		const end = start + span / cell.of;
		return [`${clock(start)} to ${clock(end)}`, ...cell.marks.map(said)].join('\n');
	}
	/** Where a slot leads: the run in it that failed, else the latest. */
	const leadOf = (cell: Cell): Mark =>
		cell.marks.find((one) => one.outcome === 'failed' || one.outcome === 'mixed') ??
		(cell.marks.at(-1) as Mark);
	/** A shade's opacity: a quarter at the palest, whole at the darkest, in even steps between. */
	const opacityOf = (shade: number) => (0.25 + (0.75 * (shade - 1)) / (SHADES - 1)).toFixed(3);
	const hrefOf = (mark: Mark) =>
		mark.run === undefined ? `${toNode(mark.node)}?tab=events` : to(`/deployments/${mark.run}`);

	const styles = stylex.create({
		label: { color: 'var(--color-text)', fontSize: text.px13 },
		/** A slot nothing ran in: a step off the card, as a status page's empty day is. */
		empty: { backgroundColor: 'color-mix(in srgb, var(--color-text) 9%, transparent)' },
		/** Done is the ink itself, so only what went wrong, or is going, carries a color. */
		succeeded: { backgroundColor: 'var(--color-text)' },
		running: { backgroundColor: 'var(--color-busy)' },
		mixed: { backgroundColor: 'var(--color-warn)' },
		failed: { backgroundColor: 'var(--color-danger)' },
		/** Pointed at, ringed in the ink, since its own shade is what it says. */
		slot: {
			outlineWidth: '1px',
			outlineStyle: { default: 'none', ':hover': 'solid' },
			outlineColor: 'var(--color-text)',
			outlineOffset: '1px',
		},
		none: { color: 'var(--color-text-muted)', fontSize: text.px13 },
	});
</script>

{#snippet slot(one: Cell | undefined)}
	{#if one}
		<a
			href={hrefOf(leadOf(one))}
			title={told(one)}
			class="min-w-0 rounded-[2px] {layout ? 'shrink-0' : 'flex-1'} {stylex.attrs(
				styles.slot,
				styles[one.outcome],
			).class}"
			style:width={layout ? `${layout.slot}px` : undefined}
			style:opacity={opacityOf(shaded.get(one) ?? SHADES)}
		></a>
	{:else}
		<span
			class="min-w-0 rounded-[2px] {layout ? 'shrink-0' : 'flex-1'} {stylex.attrs(styles.empty)
				.class}"
			style:width={layout ? `${layout.slot}px` : undefined}
		></span>
	{/if}
{/snippet}

{#if nodes || lines.length}
	<div class="flex flex-col gap-1.5">
		{#each rows as row (row.line.key)}
			{@const line = row.line}
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
				<!-- Its slots as wide and as far apart as the row lets them be, ending at now. -->
				<div
					class="flex h-5 justify-end {layout ? '' : 'gap-px'}"
					style:gap={layout ? `${layout.gap}px` : undefined}
				>
					{#each row.slots as one, index (index)}
						{@render slot(one)}
					{/each}
				</div>
			</div>
		{/each}
		<!-- What the slots are measured against: the rows' second column, empty and as wide. -->
		<div aria-hidden="true" class="h-0 {COLUMNS}">
			<span></span>
			<div bind:clientWidth={width}></div>
		</div>
	</div>
{:else}
	<p class="flex min-h-40 items-center justify-center {stylex.attrs(styles.none).class}">
		Nothing deployed in this span
	</p>
{/if}

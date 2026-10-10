<script lang="ts">
	/**
	 * The span, a line a node: its flag and health's dot, its place's telling part, and a row of
	 * slots, each the verdict of what the card asks -- deploys, services, being heard, or the
	 * worst -- grey nothing, white fine, blue planned, amber degraded, red down, its hover saying
	 * what it holds. The slots stretch to fill the row, else there are more or fewer; a view
	 * without nodes draws its busiest apps. See spec/console/overview.md, "A line is any of three
	 * things, or the worst of them".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { written } from '../chart/series.ts';
	import type { Live } from '../live.svelte.ts';
	import { nameOf, partOf } from '../map/places.ts';
	import { CODES } from '../nodes/facts.ts';
	import { scoped } from '../scope/context.ts';
	import { displayOf } from '../scope/scope.ts';
	import { offsetIn, timeZone } from '../ui/time-zone.ts';
	import type { History, Slot } from '../wire.ts';
	import HealthFlag from './health-flag.svelte';
	import SlotTip, { type Fact, type Item, type Tip } from './slot-tip.svelte';
	import { healthOf } from './health.ts';
	import {
		type Dimension,
		type Verdict,
		WORDS,
		deployed,
		downIn,
		gathered,
		heard,
		served,
		lasting,
		worse,
	} from './history.ts';
	import type { Step } from './moving.ts';
	import {
		type Cell,
		DAY,
		type Mark,
		type Outcome,
		SHADES,
		SPANS,
		type Span,
		aligned,
		fit,
		marks,
		shades,
		slots,
		slotsIn,
	} from './timeline.ts';
	import { painted } from './verdict.ts';

	let {
		live,
		steps,
		keep,
		nodes = true,
		back = '7d',
		dimension = 'overview',
		history,
	}: {
		live: Live;
		/** Every step known, history and live together. */
		steps: Step[];
		keep: (app: string) => boolean;
		/** A line a node; else a line an app, its busiest first. */
		nodes?: boolean;
		/** How far back the line reaches, by its name. */
		back?: Span;
		/** What a slot is the verdict of. */
		dimension?: Dimension;
		/** Every node's minutes over the span, gathered here to the row's slots. */
		history?: History;
	} = $props();

	const { to, node: toNode, app: toApp } = scoped();
	const zone = timeZone();

	/** Apps' lines at most, in a view without nodes. */
	const APPS = 8;
	const COLUMNS = 'grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-4';
	/** How strong a fine slot is drawn where no deploy's count shades it: quiet, so trouble shows. */
	const FINE = 0.4;

	/** The row's width once the browser has laid it out; the server draws the usual count. */
	let width = $state(0);
	const span = $derived(SPANS.find((one) => one.key === back)?.span ?? 0);
	const layout = $derived(width ? fit(back, width) : undefined);
	const of = $derived(layout?.of ?? slotsIn(back));
	/** The row's slots on whole times of the reader's clock, the last holding now. */
	const length = $derived(span / of);
	const bounds = $derived(aligned(live.now, length, of, offsetIn(zone, live.now)));
	const reach = $derived(bounds.end - bounds.start);
	/** Past the mirror's 30 days a deploy is read from the history's day counts, not its runs. */
	const counted = $derived(span > 30 * DAY);

	const drawn = $derived(
		marks(
			steps.filter((step) => keep(step.app)),
			bounds.end,
			reach,
		),
	);

	interface Line {
		key: string;
		href: string;
		marks: Mark[];
		code?: string;
		app?: string;
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
			app,
			label: displayOf(app),
			whole: displayOf(app),
		}));
	});

	/** Each node's history gathered to the row's slots, once for every line. */
	const minutes = $derived(
		new Map<string, (Slot | undefined)[]>(
			CODES.map((code) => [code, gathered(history, code, bounds.end, reach, of)]),
		),
	);

	/**
	 * When each node's history begins, its first minute due: a slot before it is one nothing was
	 * recording, which its hover says rather than reading as a node with nothing to report.
	 */
	const began = $derived(
		new Map(
			Object.entries(history?.nodes ?? {}).flatMap(([code, its]) => {
				const first = its.find((one) => one.due);
				return first ? [[code, Date.parse(first.at)] as const] : [];
			}),
		),
	);
	const earliest = $derived(began.size ? Math.min(...began.values()) : undefined);

	/** A deploy's outcome from a slot's day counts, as a run's would be. */
	function counts(slot: Slot | undefined): Outcome | undefined {
		const runs = slot?.runs;
		if (!runs) return undefined;
		if (runs.running) return 'running';
		const failed = runs.failed ?? 0;
		const done = runs.succeeded ?? 0;
		if (runs.partly_failed || (failed && done)) return 'mixed';
		if (failed) return 'failed';
		return done ? 'succeeded' : undefined;
	}

	/** One slot as drawn: its verdict, how strong, its tip, and where it leads. */
	interface Drawn {
		verdict: Verdict;
		opacity: number;
		tip: Tip;
		href?: string;
	}

	const rows = $derived(lines.map((line) => ({ line, cells: slots(line.marks, of) })));
	const shaded = $derived(shades(rows.flatMap((row) => row.cells)));

	/** How long, in its one largest unit: `42s`, `3m`. */
	function took(mark: Mark): string {
		if (!mark.finished_at) return 'now';
		const seconds = Math.round((Date.parse(mark.finished_at) - Date.parse(mark.started_at)) / 1000);
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
		return `${Math.round(seconds / 3600)}h`;
	}
	const appsOf = (mark: Mark) => mark.apps.map(displayOf).join(', ');
	/** Where a slot leads: the run in it that failed, else the latest. */
	const leadOf = (cell: Cell): Mark =>
		cell.marks.find((one) => one.outcome === 'failed' || one.outcome === 'mixed') ??
		(cell.marks.at(-1) as Mark);
	/** A shade's opacity: a quarter at the palest, whole at the darkest, in even steps between. */
	const opacityOf = (shade: number) => 0.25 + (0.75 * (shade - 1)) / (SHADES - 1);
	const hrefOf = (mark: Mark) =>
		mark.run === undefined ? `${toNode(mark.node)}?tab=events` : to(`/deployments/${mark.run}`);

	const dayOf = (at: number) => written(at, zone, 'day');
	/** A slot's time on the reader's clock: `9 PM` of `Oct 9`, `Oct 9` a `Thu`, `Oct 7 – 9`. */
	function timeOf(start: number): Pick<Tip, 'time' | 'date'> {
		if (length < DAY) {
			return { time: written(start, zone, 'hour').replace(':00', ''), date: dayOf(start) };
		}
		if (length === DAY) {
			return { time: dayOf(start), date: written(start, zone, 'weekday') };
		}
		const last = start + length - 1;
		const [from, to] = [dayOf(start), dayOf(last)];
		const [month, day] = to.split(' ');
		return { time: from.startsWith(`${month} `) ? `${from} – ${day}` : `${from} – ${to}` };
	}

	/** Names shown in a tip at most; the rest are counted. */
	const NAMED = 4;

	/** The slot at `index` of `line`, as the card's dimension draws it. */
	function slotOf(line: Line, cell: Cell | undefined, index: number): Drawn {
		const start = bounds.start + index * length;
		const end = start + length;
		const own = line.code ? minutes.get(line.code)?.[index] : undefined;
		// An app's services are the worst any node had of it.
		const across = line.app
			? CODES.flatMap((code) => {
					const slot = minutes.get(code)?.[index];
					return slot ? [{ code, slot }] : [];
				})
			: [];

		const outcome = counted ? counts(own) : cell?.outcome;
		const deploys = deployed(outcome);
		const services = line.app
			? across.reduce<Verdict>((worst, one) => worse(worst, served(one.slot, line.app)), 'none')
			: served(own);
		const connectivity = line.code ? heard(own) : 'none';

		const from = line.code ? began.get(line.code) : earliest;
		const unrecorded = from === undefined || end <= from;
		const wordOf = (what: Fact['what'], verdict: Verdict) =>
			verdict === 'none' && what !== 'deploys' && unrecorded ? 'Unrecorded' : WORDS[what][verdict];
		const facts: Fact[] = [
			{ what: 'deploys' as const, verdict: deploys },
			{ what: 'services' as const, verdict: services },
			...(line.code ? [{ what: 'connectivity' as const, verdict: connectivity }] : []),
		]
			.filter((fact) => dimension === 'overview' || fact.what === dimension)
			.map((fact) => ({ ...fact, word: wordOf(fact.what, fact.verdict) }));

		const asks = (what: Fact['what']) => dimension === 'overview' || dimension === what;
		const items: Item[] = [
			...(asks('services')
				? line.app
					? across.flatMap(({ code, slot }) =>
							downIn(slot, line.app).map((one) => ({
								key: `down ${code}`,
								name: partOf(code),
								lasted: lasting(one.seconds),
								verdict: served(slot, line.app),
							})),
						)
					: downIn(own).map((one) => ({
							key: `down ${one.app}`,
							name: displayOf(one.app),
							lasted: lasting(one.seconds),
							verdict: services,
						}))
				: []),
			...(asks('connectivity') && own?.missing
				? [
						{
							key: 'unheard',
							name: 'Unheard',
							lasted: lasting(own.missing * 60),
							verdict: connectivity,
						},
					]
				: []),
			...(asks('deploys')
				? (cell?.marks ?? []).map((mark) => ({
						key: mark.key,
						name: appsOf(mark),
						lasted: took(mark),
						verdict: deployed(mark.outcome),
					}))
				: []),
		];
		const tip: Tip = {
			...timeOf(start),
			facts,
			items: items.slice(0, NAMED),
			more: Math.max(0, items.length - NAMED),
		};
		const deployShade = cell ? opacityOf(shaded.get(cell) ?? SHADES) : FINE;

		if (dimension !== 'overview') {
			const verdict = { deploys, services, connectivity }[dimension];
			return {
				verdict,
				opacity: dimension === 'deploys' ? deployShade : verdict === 'fine' ? FINE : 1,
				tip,
				href: cell ? hrefOf(leadOf(cell)) : undefined,
			};
		}
		const verdict = [deploys, services, connectivity].reduce(worse, 'none');
		return {
			verdict,
			// Fine is as strong as its deploys made it, else quiet; trouble is drawn whole.
			opacity:
				verdict === 'fine' ? (cell ? deployShade : FINE) : verdict === deploys ? deployShade : 1,
			tip,
			href: cell && verdict === deploys ? hrefOf(leadOf(cell)) : undefined,
		};
	}

	/** The slot pointed at or focused, and where it stands on the screen, for its tip. */
	let pointed: { tip: Tip; at: DOMRect } | undefined = $state();
	const point = (one: Drawn) => (event: Event) => {
		pointed = { tip: one.tip, at: (event.currentTarget as HTMLElement).getBoundingClientRect() };
	};
	const leave = () => (pointed = undefined);
	// A scroll moves the slot from under its tip, so the tip goes with the scroll.
	$effect(() => {
		addEventListener('scroll', leave, { capture: true, passive: true });
		return () => removeEventListener('scroll', leave, { capture: true });
	});

	const styles = stylex.create({
		label: { color: 'var(--color-text)', fontSize: text.px13 },
		/** Pointed at, ringed flush in the focus ring's color, the ring the keyboard's focus draws. */
		slot: {
			outlineWidth: '2px',
			outlineStyle: { default: 'none', ':hover': 'solid', ':focus-visible': 'solid' },
			outlineColor: 'var(--color-accent)',
			outlineOffset: 0,
			position: 'relative',
			zIndex: { default: 'auto', ':hover': 1 },
		},
		none: { color: 'var(--color-text-muted)', fontSize: text.px13 },
	});
</script>

{#snippet slot(one: Drawn)}
	<!-- The ring on the slot and the shade on what it holds, so the ring is drawn whole. -->
	<svelte:element
		this={one.href ? 'a' : 'span'}
		href={one.href}
		role={one.href ? undefined : 'img'}
		aria-label={[one.tip.time, one.tip.date, ...one.tip.facts.map((fact) => fact.word)]
			.filter(Boolean)
			.join(', ')}
		tabindex={one.href ? undefined : -1}
		class="min-w-0 rounded-[2px] {layout ? 'shrink-0' : 'flex-1'} {stylex.attrs(styles.slot).class}"
		style:width={layout ? `${layout.slot}px` : undefined}
		onpointerenter={point(one)}
		onpointerleave={leave}
		onfocus={point(one)}
		onblur={leave}
	>
		<span
			class="block size-full rounded-[2px] {stylex.attrs(painted[one.verdict]).class}"
			style:opacity={one.verdict === 'none' ? undefined : one.opacity.toFixed(3)}
		></span>
	</svelte:element>
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
					{#each row.cells as cell, index (index)}
						{@render slot(slotOf(line, cell, index))}
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
	{#if pointed}<SlotTip tip={pointed.tip} at={pointed.at} />{/if}
{:else}
	<p class="flex min-h-40 items-center justify-center {stylex.attrs(styles.none).class}">
		Nothing deployed in this span
	</p>
{/if}

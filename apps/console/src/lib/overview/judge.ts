/**
 * The timeline as data: which lines it draws, and each slot's verdict on each, from what is known
 * of the span. Pure, so the server works out the first paint's colors with the same code the
 * component draws with after. See spec/console/overview.md, "A line is any of three things, or
 * the worst of them", and spec/architecture/console.md, "Drawn before the first paint".
 */
import { nameOf, partOf } from '../map/places.ts';
import { LOCATIONS } from '../map/land.generated.ts';
import { CODES } from '../nodes/facts.ts';
import { type Scope, displayOf, scopeOf } from '../scope/scope.ts';
import type { App, Entry, History, Slot } from '../wire.ts';
import {
	type Axis,
	type Dimension,
	VERDICTS,
	type Verdict,
	deployed,
	gathered,
	heard,
	served,
	servedOf,
	worse,
} from './history.ts';
import type { Trace } from './moving.ts';
import {
	type Cell,
	DAY,
	type Mark,
	type Outcome,
	SPANS,
	type Span,
	aligned,
	countsOf,
	marks,
	shades,
	slots,
	SHADES,
} from './timeline.ts';

/** A node as the lines read it: the apps it runs, and whether each is running or held. */
export interface Hosting {
	snapshot?: { apps: readonly Pick<App, 'name' | 'running' | 'held'>[] };
}

/** Each node's `Hosting`, and nothing else of what the relay sends. */
export function hostingOf(nodes: Readonly<Record<string, Entry>>): Record<string, Hosting> {
	return Object.fromEntries(
		Object.entries(nodes).map(([code, entry]) => [
			code,
			entry.snapshot
				? {
						snapshot: {
							apps: entry.snapshot.apps.map(({ name, running, held }) => ({ name, running, held })),
						},
					}
				: {},
		]),
	);
}

/** What the timeline is drawn from. */
export interface Ground {
	/** Every step known, read and live together. */
	steps: Trace[];
	/** Every node's minutes over the span. */
	history?: History;
	/** Every node's apps as they are held now. */
	nodes: Readonly<Record<string, Hosting>>;
	keep: (app: string) => boolean;
	/** Whether the view has nodes to draw a line each; without them the lines are apps. */
	withNodes: boolean;
	by: Axis;
	back: Span;
	/** The moment the last slot holds. */
	now: number;
	/** The reader's zone's offset from UTC at a moment, in milliseconds. */
	offset: (at: number) => number;
}

export interface Line {
	key: string;
	marks: Mark[];
	code?: string;
	app?: string;
	/** Every app the line stands for, more than one where apps share a name. */
	apps?: string[];
	/** An app's layer, which its line is grouped under. */
	layer?: Scope;
	label: string;
	/** The whole name, on the label's hover. */
	whole: string;
}

/** The nodes west to east, as the map lays them out left to right, a place's nodes together. */
const WEST_TO_EAST = CODES.toSorted((a, b) => LOCATIONS[a][1] - LOCATIONS[b][1]);
/** The layers an app line is grouped in, in the order the console's views name them. */
const LAYERS = ['infra', 'platform', 'services'] as const;

/** The span laid out in `of` slots: where they fall, the lines, and what each slot holds. */
export interface Laid {
	of: number;
	/** How long a slot is, in milliseconds. */
	length: number;
	bounds: { start: number; end: number };
	/** Past the mirror's 30 days a deploy is read from the history's day counts, not its runs. */
	counted: boolean;
	lines: Line[];
	rows: { line: Line; cells: (Cell | undefined)[] }[];
	/** Each node's history gathered to the slots. */
	minutes: Map<string, (Slot | undefined)[]>;
	/** When each node's history begins, its first minute due. */
	began: Map<string, number>;
	earliest: number | undefined;
	shaded: Map<Cell, number>;
}

/** `ground`'s span in `of` slots, on whole times of the reader's clock, the last holding now. */
export function laid(ground: Ground, of: number): Laid {
	const span = SPANS.find((one) => one.key === ground.back)?.span ?? 0;
	const length = span / of;
	const bounds = aligned(ground.now, length, of, ground.offset(ground.now));
	const reach = bounds.end - bounds.start;
	const drawn = marks(
		ground.steps.filter((step) => ground.keep(step.app)),
		bounds.end,
		reach,
	);
	const lines = lineup(ground, drawn);
	const rows = lines.map((line) => ({ line, cells: slots(line.marks, of) }));
	const minutes = new Map<string, (Slot | undefined)[]>(
		CODES.map((code) => [code, gathered(ground.history, code, bounds.end, reach, of)]),
	);
	// A slot before a node's history begins is one nothing was recording, which its hover says
	// rather than reading as a node with nothing to report.
	const began = new Map(
		Object.entries(ground.history?.nodes ?? {}).flatMap(([code, its]) => {
			const first = its.find((one) => one.due);
			return first ? [[code, Date.parse(first.at)] as const] : [];
		}),
	);
	return {
		of,
		length,
		bounds,
		counted: span > 30 * DAY,
		lines,
		rows,
		minutes,
		began,
		earliest: began.size ? Math.min(...began.values()) : undefined,
		shaded: shades(rows.flatMap((row) => row.cells)),
	};
}

/** The lines: the nodes west to east, or the apps by layer then name, those one name merged. */
function lineup(ground: Ground, drawn: Mark[]): Line[] {
	if (ground.withNodes && ground.by === 'node') {
		return WEST_TO_EAST.map((code) => ({
			key: code,
			marks: drawn.filter((mark) => mark.node === code),
			code,
			label: partOf(code),
			whole: nameOf(code).full,
		}));
	}
	// Every app the view shows: what the nodes run now, and what ran in the span besides.
	const apps = new Set([
		...Object.values(ground.nodes).flatMap((entry) =>
			(entry.snapshot?.apps ?? []).map((app) => app.name),
		),
		...drawn.flatMap((mark) => mark.apps),
	]);
	// Apps one name, as apk and apt are both Package Updates, are one line, as a place's nodes are
	// one line of the place list; the line's name opens a choice between them.
	const named = Map.groupBy(
		[...apps].filter((app) => ground.keep(app)),
		(app) => displayOf(app),
	);
	return [...named]
		.map(([name, members]) => ({ name, members: members.toSorted() }))
		.toSorted(
			(a, b) =>
				LAYERS.indexOf(scopeOf(a.members[0] ?? '')) - LAYERS.indexOf(scopeOf(b.members[0] ?? '')) ||
				a.name.localeCompare(b.name),
		)
		.map(({ name, members }) => ({
			key: members.join(' '),
			marks: drawn.filter((mark) => mark.apps.some((app) => members.includes(app))),
			app: members[0],
			apps: members,
			layer: scopeOf(members[0] ?? ''),
			label: name,
			whole: members.length > 1 ? `${name}: ${members.join(', ')}` : name,
		}));
}

/** Each place `apps` run now, one entry a node and app, those held on purpose aside. */
export const runsOf = (nodes: Ground['nodes'], apps: string[]) =>
	CODES.flatMap((code) =>
		(nodes[code]?.snapshot?.apps ?? []).filter((one) => apps.includes(one.name) && !one.held),
	);

/** How many apps a node runs as it is read now, those held on purpose aside. */
const running = (nodes: Ground['nodes'], code: string) =>
	nodes[code]?.snapshot?.apps.filter((app) => !app.held).length ?? 0;

/**
 * An app's services as the overview weighs them across the nodes that run it: down where it is
 * down on every one of them, degraded where on some, as a node's are weighed among its apps.
 */
function hostsOf(
	nodes: Ground['nodes'],
	apps: string[],
	across: { code: string; slot: Slot }[],
): Verdict {
	const pairs = across.flatMap((one) => apps.map((app) => served(one.slot, app)));
	const worst = pairs.reduce<Verdict>(worse, 'none');
	if (worst !== 'down') return worst;
	const hosts = runsOf(nodes, apps).length;
	const down = pairs.filter((one) => one === 'down').length;
	return hosts > 0 && down >= hosts ? 'down' : 'degraded';
}

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

/** A shade's opacity: a quarter at the palest, whole at the darkest, in even steps between. */
export const opacityOf = (shade: number) => 0.25 + (0.75 * (shade - 1)) / (SHADES - 1);

/** One slot judged: each dimension's verdict, the card's drawn, and what it was read from. */
export interface Judged {
	verdict: Verdict;
	/** The shade it is drawn in, `SHADES` the darkest. */
	shade: number;
	deploys: Verdict;
	services: Verdict;
	connectivity: Verdict;
	/** Whether the overview's verdict is the deploys', so the slot leads to a run. */
	changed: boolean;
	/** The line's node's minutes in the slot. */
	own?: Slot;
	/** For an app's line, each node's minutes in the slot. */
	across: { code: string; slot: Slot }[];
	start: number;
	end: number;
	/** Whether nothing was recording yet when the slot ended. */
	unrecorded: boolean;
}

/** The slot at `index` of `line` as `dimension` reads it. */
export function judged(
	ground: Ground,
	lay: Laid,
	line: Line,
	cell: Cell | undefined,
	index: number,
	dimension: Dimension,
): Judged {
	const start = lay.bounds.start + index * lay.length;
	const end = start + lay.length;
	const own = line.code ? lay.minutes.get(line.code)?.[index] : undefined;
	// An app's services are the worst any node had of it.
	const members = line.apps ?? [];
	const across = members.length
		? CODES.flatMap((code) => {
				const slot = lay.minutes.get(code)?.[index];
				return slot ? [{ code, slot }] : [];
			})
		: [];

	const outcome = lay.counted ? counts(own) : cell?.outcome;
	const deploys = deployed(outcome);
	const services = members.length
		? across
				.flatMap((one) => members.map((app) => served(one.slot, app)))
				.reduce<Verdict>(worse, 'none')
		: served(own);
	const connectivity = line.code ? heard(own) : 'none';
	const from = line.code ? lay.began.get(line.code) : lay.earliest;
	const base = { deploys, services, connectivity, own, across, start, end };
	const unrecorded = from === undefined || end <= from;

	if (dimension !== 'overview') {
		return {
			...base,
			verdict: { deploys, services, connectivity }[dimension],
			// Deploys are shaded by how many ran; the rest are drawn whole.
			shade: dimension === 'deploys' && cell ? (lay.shaded.get(cell) ?? SHADES) : SHADES,
			changed: false,
			unrecorded,
		};
	}
	// A deploy that went well is still a change made, so the overview draws it blue with what is
	// planned; green is left for a slot where nothing changed and nothing went wrong.
	const changed = deploys === 'fine' ? 'planned' : deploys;
	// A node's services weighed among all it runs: some down is degraded, every one down is down.
	const weighed = line.code
		? servedOf(own, running(ground.nodes, line.code))
		: hostsOf(ground.nodes, members, across);
	const verdict = [changed, weighed, connectivity].reduce(worse, 'none');
	return { ...base, verdict, shade: SHADES, changed: verdict === changed, unrecorded };
}

/**
 * A slot as one character: its verdict and its shade, each pair a letter of its own, so a row is
 * a string the page carries whole and a span of one verdict repeats one letter.
 */
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX';

export const encoded = (verdict: Verdict, shade: number): string =>
	ALPHABET[VERDICTS.indexOf(verdict) * SHADES + shade - 1] ?? 'a';

export function decoded(letter: string): { verdict: Verdict; shade: number } {
	const index = Math.max(0, ALPHABET.indexOf(letter));
	return { verdict: VERDICTS[Math.floor(index / SHADES)] ?? 'none', shade: (index % SHADES) + 1 };
}

/** A line as the first paint needs it: what it is called and what it stands for, not its runs. */
export type Named = Omit<Line, 'marks'>;

/**
 * The timeline as the first paint draws it, before anything else of the span is read: the lines,
 * and each line's slots as letters for every count the row may be drawn in, so the page draws
 * whichever its width fits. See spec/architecture/console.md, "Drawn before the first paint".
 */
export interface Dry {
	/** The moment its last slot holds. */
	at: number;
	lines: Named[];
	counts: number[];
	/** By count, then by line, the line's slots as letters. */
	rows: string[][];
}

export function dried(ground: Ground, dimension: Dimension): Dry {
	const counts = countsOf(ground.back);
	const lays = counts.map((of) => laid(ground, of));
	// The lines of the finest count, which every count's letters follow; a line another count
	// lacks is drawn as nothing there.
	const lines = lays[0]?.lines ?? [];
	const rows = lays.map((lay) =>
		lines.map((line) => {
			const row = lay.rows.find((one) => one.line.key === line.key);
			if (!row) return 'a'.repeat(lay.of);
			return row.cells
				.map((cell, index) => {
					const one = judged(ground, lay, row.line, cell, index, dimension);
					return encoded(one.verdict, one.shade);
				})
				.join('');
		}),
	);
	return {
		at: ground.now,
		lines: lines.map(({ key, code, app, apps, layer, label, whole }) => ({
			key,
			code,
			app,
			apps,
			layer,
			label,
			whole,
		})),
		counts,
		rows,
	};
}

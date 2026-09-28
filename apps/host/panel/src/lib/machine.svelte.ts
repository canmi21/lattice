/**
 * The machine as the overview reads it: the latest second, a minute of seconds kept here for the
 * sparklines and the live charts, and a series at the grain the chosen span needs, each asked for
 * again on its own beat. See spec/architecture/agent.md, "Retention".
 */
import { api, type Grain, type MachineInfo, type Point, type Sample } from './api';
import type { Datum } from './chart/series';
import { signedOut } from './session.svelte';

/** The spans the overview offers, the grain each is read at, and how often it is read again. */
export const SPANS = {
	live: { label: 'Live', seconds: 60, grain: 'second', every: 1 },
	hour: { label: '1 hour', seconds: 3600, grain: 'minute', every: 15 },
	day: { label: '24 hours', seconds: 86400, grain: 'hour', every: 60 },
	week: { label: '7 days', seconds: 7 * 86400, grain: 'hour', every: 300 },
	month: { label: '30 days', seconds: 30 * 86400, grain: 'hour', every: 300 },
} as const satisfies Record<
	string,
	{ label: string; seconds: number; grain: Grain; every: number }
>;

export type Span = keyof typeof SPANS;

/** Every metric the charts draw; per-core figures come from the latest second alone. */
const CHARTED = [
	'cpu.usage',
	'cpu.iowait',
	'memory',
	'swap',
	'network',
	'disk',
	'temperature',
	'load',
];

/** How many seconds the live ring holds. */
const RING = 60;

export class Machine {
	info: MachineInfo | undefined = $state();
	latest: Sample | undefined = $state();
	/** The last minute, a sample a second, oldest first. */
	ring: Sample[] = $state([]);
	/** The chosen span's points, for every span but the live one. */
	points: Point[] = $state([]);
	span: Span = $state('live');
	failure = $state('');

	/** Which span `points` belongs to; until it is the chosen one, a chart has nothing to draw. */
	loaded: Span | undefined = $state();

	#timers: ReturnType<typeof setInterval>[] = [];

	/** Starts asking; the returned function stops. */
	start(): () => void {
		void this.#seed();
		this.#timers.push(setInterval(() => void this.#tick(), 1000));
		return () => this.#timers.forEach(clearInterval);
	}

	/** The span shown, as seconds since the epoch, ending now. */
	get window(): { since: number; until: number } {
		const until = this.latest?.at ?? Math.floor(Date.now() / 1000);
		return { since: until - SPANS[this.span].seconds, until };
	}

	/** One metric over the chosen span, as a chart draws it. */
	series(metric: string): Datum[] {
		if (this.span === 'live') {
			return this.ring
				.filter((sample) => metric in sample.values)
				.map((sample) => ({ at: sample.at, value: sample.values[metric]! }));
		}
		if (this.loaded !== this.span) return [];
		return this.points
			.filter((point) => metric in point.values)
			.map((point) => {
				const summary = point.values[metric]!;
				return {
					at: point.at,
					value: summary.average,
					minimum: summary.minimum,
					maximum: summary.maximum,
				};
			});
	}

	/** The last minute of one metric, for a sparkline whatever span is chosen. */
	recent(metric: string): Datum[] {
		return this.ring
			.filter((sample) => metric in sample.values)
			.map((sample) => ({ at: sample.at, value: sample.values[metric]! }));
	}

	/** Every metric name the latest second carries under a prefix. */
	names(prefix: string): string[] {
		return Object.keys(this.latest?.values ?? {})
			.filter((name) => name.startsWith(`${prefix}.`))
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	}

	async #seed() {
		try {
			const [now, seconds] = await Promise.all([
				api.now(),
				api.series('second', CHARTED.concat('storage'), undefined),
			]);
			this.info = now.info;
			this.latest = now.sample;
			this.ring = seconds.map((point) => ({
				at: point.at,
				values: Object.fromEntries(
					Object.entries(point.values).map(([name, summary]) => [name, summary.average]),
				),
			}));
			this.#append(now.sample);
		} catch (error) {
			this.#fail(error);
		}
	}

	async #tick() {
		try {
			const now = await api.now();
			this.info = now.info;
			this.latest = now.sample;
			this.#append(now.sample);
			this.failure = '';
		} catch (error) {
			this.#fail(error);
		}
		const span = SPANS[this.span];
		const at = this.latest?.at ?? 0;
		if (this.span !== 'live' && (this.loaded !== this.span || at % span.every === 0)) {
			await this.#load();
		}
	}

	/** Reads the chosen span now rather than on the next beat, as when it has just been chosen. */
	refresh(): void {
		if (this.span !== 'live') void this.#load();
	}

	async #load() {
		const span = this.span;
		try {
			const points = await api.series(SPANS[span].grain, CHARTED, this.window.since);
			if (this.span !== span) return;
			this.points = points;
			this.loaded = span;
		} catch (error) {
			this.#fail(error);
		}
	}

	#append(sample: Sample) {
		if (this.ring.at(-1)?.at === sample.at) return;
		this.ring = [...this.ring, sample].slice(-RING);
	}

	#fail(error: unknown) {
		if (!signedOut(error)) this.failure = error instanceof Error ? error.message : String(error);
	}
}

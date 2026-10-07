/**
 * A node's series as its overview draws them: the meter's metrics, named in infra's
 * spec/architecture/meter.md, "Metrics", grouped into one chart each. Every chart takes the series
 * colors in the same fixed order, so a line's color follows its place in the chart, never its rank.
 */
import type { Point } from '../host.ts';
import { type Line, metric } from '../chart/series.ts';
import type { Event } from '../wire.ts';

const color = (index: number) => `var(--color-series-${(index % 8) + 1})`;

function lines(points: Point[], named: readonly (readonly [string, string])[]): Line[] {
	return named.map(([name, label], index) => ({
		key: name,
		label,
		color: color(index),
		points: metric(points, name),
	}));
}

/** The metrics `pattern` matches, each with the part it captures, in that part's natural order. */
function family(points: Point[], pattern: RegExp): { name: string; part: string }[] {
	const names = new Set(points.flatMap((point) => Object.keys(point.values)));
	return [...names]
		.flatMap((name) => {
			const part = pattern.exec(name)?.[1];
			return part === undefined ? [] : [{ name, part }];
		})
		.toSorted((a, b) => a.part.localeCompare(b.part, 'en-US', { numeric: true }));
}

export interface Cores {
	rows: { key: string; label: string }[];
	/** Each column's moment, oldest first. */
	times: number[];
	/** A row per core, NaN where the meter read nothing. */
	values: number[][];
}

export interface NodeCharts {
	cpu: Line[];
	cores: Cores;
	memory: Line[];
	network: Line[];
	disk: Line[];
	load: Line[];
	temperature: Line[];
}

export function nodeCharts(series: Point[]): NodeCharts {
	const points = series.toSorted((a, b) => a.at - b.at);
	const cores = family(points, /^cpu\.core\.(\d+)\.usage$/);
	const zones = family(points, /^temperature\.(.+)$/);
	return {
		cpu: lines(points, [
			['cpu.usage', 'Usage'],
			['cpu.iowait', 'I/O wait'],
		]),
		cores: {
			rows: cores.map(({ name, part }) => ({ key: name, label: `Core ${part}` })),
			times: points.map((point) => point.at),
			values: cores.map(({ name }) =>
				points.map((point) => point.values[name]?.average ?? Number.NaN),
			),
		},
		memory: lines(points, [
			['memory.used', 'Used'],
			['memory.cached', 'Cached'],
			['swap.used', 'Swap'],
		]),
		network: lines(points, [
			['network.received', 'Received'],
			['network.sent', 'Sent'],
		]),
		disk: lines(points, [
			['disk.read', 'Read'],
			['disk.written', 'Written'],
		]),
		load: lines(points, [
			['load.1', '1 min'],
			['load.5', '5 min'],
			['load.15', '15 min'],
		]),
		temperature: lines(
			points,
			zones.map(({ name, part }) => [name, part] as const),
		),
	};
}

/** What changes what a node runs, as host names its actions. */
const DEPLOYS = new Set(['deploy', 'redeploy', 'rollback', 'rollback_with_data']);

/**
 * A node's deploys between `since` and `until`, in seconds, as a chart's markers: those starting
 * in one second share a marker, since a chart keys its markers by moment.
 */
export function markers(events: Event[], since: number, until: number) {
	const byMoment = new Map<number, string[]>();
	for (const event of events) {
		const at = Math.floor(Date.parse(event.started_at) / 1000);
		if (!DEPLOYS.has(event.action) || !(at >= since && at <= until)) continue;
		const said = `${event.app} ${event.action.replaceAll('_', ' ')}`;
		byMoment.set(at, [...(byMoment.get(at) ?? []), said]);
	}
	return [...byMoment.entries()]
		.toSorted(([a], [b]) => a - b)
		.map(([at, said]) => ({ at, label: said.join(', ') }));
}

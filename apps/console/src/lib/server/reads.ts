/**
 * What each page asks of one node, typed: a node's host under `/api`, through `node()`. Every
 * helper is one request with a timeout, so a slow node cannot hold a page. See
 * spec/architecture/console.md, "It reads, and does not write, at first".
 */
import type { AppDetail, Disk, Grain, Now, Page, Point } from '../host.ts';
import type { Event } from '../wire.ts';
import { TIMEOUT } from './edge.ts';
import { type Edge, type Read, node } from './read.ts';

/** The ranges a chart offers. */
export type Range = '1h' | '6h' | '24h' | '7d' | '30d';

export interface Span {
	grain: Exclude<Grain, 'second'>;
	/** Seconds since the epoch, as the meter reads them. */
	since: number;
	until: number;
}

/**
 * Grain and bounds for a range. The meter keeps minutes for one hour only, so `1h` is the one
 * range drawn from them and every longer one is drawn from hours.
 */
export function range(of: Range, now = Math.floor(Date.now() / 1000)): Span {
	const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 }[of];
	return { grain: of === '1h' ? 'minute' : 'hour', since: now - hours * 3600, until: now };
}

/** A series asked for: `metrics` are names or dotted prefixes, none is every metric. */
export interface Series extends Span {
	metrics?: string[];
}

/** Query text for a span; keys in a fixed order so a request is the same string every time. */
function query(series: Partial<Series>): string {
	const asked = new URLSearchParams();
	if (series.grain) asked.set('grain', series.grain);
	if (series.metrics?.length) asked.set('metrics', series.metrics.join(','));
	if (series.since !== undefined) asked.set('since', String(series.since));
	if (series.until !== undefined) asked.set('until', String(series.until));
	const text = asked.toString();
	return text && `?${text}`;
}

function paged(page: Page): string {
	const asked = new URLSearchParams();
	if (page.before !== undefined) asked.set('before', String(page.before));
	if (page.limit !== undefined) asked.set('limit', String(page.limit));
	const text = asked.toString();
	return text && `?${text}`;
}

/** An app's name as one path segment; host refuses what it does not know. */
const segment = encodeURIComponent;

export const nodeNow = (edge: Edge, name: string): Promise<Read<Now>> =>
	node(edge, name, '/node/now', TIMEOUT);

export const nodeSeries = (edge: Edge, name: string, series: Series): Promise<Read<Point[]>> =>
	node(edge, name, `/node/series${query(series)}`, TIMEOUT);

export const apps = (edge: Edge, name: string): Promise<Read<AppDetail[]>> =>
	node(edge, name, '/apps', TIMEOUT);

export const app = (edge: Edge, name: string, of: string): Promise<Read<AppDetail>> =>
	node(edge, name, `/apps/${segment(of)}`, TIMEOUT);

/** An app's own metrics, `<name>.cpu` and the rest, at the span's grain. */
export const appSeries = (
	edge: Edge,
	name: string,
	of: string,
	span: Span,
): Promise<Read<Point[]>> =>
	node(edge, name, `/apps/${segment(of)}/metrics/series${query({ ...span })}`, TIMEOUT);

/** One app's events on one node, newest first. */
export const history = (
	edge: Edge,
	name: string,
	of: string,
	page: Page = {},
): Promise<Read<Event[]>> =>
	node(edge, name, `/apps/${segment(of)}/history${paged(page)}`, TIMEOUT);

/** Every app's events on one node, newest first. */
export const events = (edge: Edge, name: string, page: Page = {}): Promise<Read<Event[]>> =>
	node(edge, name, `/events${paged(page)}`, TIMEOUT);

export const disk = (edge: Edge, name: string): Promise<Read<Disk>> =>
	node(edge, name, '/inspect/disk', TIMEOUT);

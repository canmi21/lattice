/**
 * Which part of a node's page is open, as its query says it: a tab, the span its charts cover,
 * and where its events page starts. In the query, so a view can be linked and is rendered whole.
 */
import type { Range } from '../server/reads.ts';

export const TABS = [
	{ key: 'overview', label: 'Overview' },
	{ key: 'apps', label: 'Apps' },
	{ key: 'events', label: 'Events' },
	{ key: 'disk', label: 'Disk' },
] as const;

export type Tab = (typeof TABS)[number]['key'];

const RANGES: readonly Range[] = ['1h', '6h', '24h', '7d', '30d'];

export interface View {
	tab: Tab;
	range: Range;
	/** The event id the events page starts below; the newest page when absent. */
	before?: number;
}

export function viewOf(query: Pick<URLSearchParams, 'get'>): View {
	const tab = TABS.find(({ key }) => key === query.get('tab'))?.key ?? 'overview';
	const range = RANGES.find((key) => key === query.get('range')) ?? '1h';
	const before = Number(query.get('before'));
	return Number.isSafeInteger(before) && before > 0 ? { tab, range, before } : { tab, range };
}

/** The query for `view`, writing only what differs from the defaults. */
export function hrefOf(view: View): string {
	const query = new URLSearchParams();
	if (view.tab !== 'overview') query.set('tab', view.tab);
	if (view.range !== '1h') query.set('range', view.range);
	if (view.before !== undefined) query.set('before', String(view.before));
	const text = query.toString();
	return text ? `?${text}` : '?';
}

/** How many events a page of them holds. */
export const PAGE = 50;

/** Where the page after `ids` starts, or nothing where this page was the last. */
export function olderThan(ids: number[], limit = PAGE): number | undefined {
	return ids.length < limit || ids.length === 0 ? undefined : Math.min(...ids);
}

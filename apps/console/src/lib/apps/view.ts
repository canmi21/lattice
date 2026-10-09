/**
 * Which of an app's pages is open, and the span its figures cover, as its query says them -- as a
 * node's are, src/lib/nodes/view.ts. In the query, so a page can be linked and is rendered whole.
 */
import type { Range } from '../server/reads.ts';
import { RANGES } from '../ui/segmented.svelte';

export const TABS = [
	{ key: 'overview', label: 'Overview' },
	{ key: 'usage', label: 'Usage' },
	{ key: 'history', label: 'Deploy history' },
] as const;

export type Tab = (typeof TABS)[number]['key'];

export interface AppView {
	tab: Tab;
	range: Range;
}

export function appViewOf(query: Pick<URLSearchParams, 'get'>): AppView {
	const tab = TABS.find(({ key }) => key === query.get('tab'))?.key ?? 'overview';
	const range = RANGES.find(({ key }) => key === query.get('range'))?.key ?? '24h';
	return { tab, range };
}

/** The query for `view`, writing only what differs from the defaults. */
export function appQuery(view: AppView): string {
	const query = new URLSearchParams();
	if (view.tab !== 'overview') query.set('tab', view.tab);
	if (view.range !== '24h') query.set('range', view.range);
	const text = query.toString();
	return text ? `?${text}` : '?';
}

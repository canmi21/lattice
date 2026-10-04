import { dayName, historyFloor } from '#lib/board.js';
import { RAW_GRAIN, rangeFloor, rawFloor, readRange, SPAN } from '#lib/ranges.js';
import {
	fetchChecks,
	fetchDaily,
	fetchGrain,
	fetchHistory,
	fetchNow,
	statusClient,
} from '#lib/source.js';
import type { PageServerLoad } from './$types';

/**
 * The first screen, whole, so it is what an index reads; the edge keeps a render a few seconds. A
 * database that does not answer renders an empty board saying so rather than an error page, and the
 * browser keeps asking. See platform's spec/architecture/probe.md, "The page: one app, three
 * doors".
 */
export const load: PageServerLoad = async ({ fetch, setHeaders, url }) => {
	const range = readRange(url.searchParams.get('range'));
	const grain = SPAN[range].grain;
	setHeaders({ 'cache-control': 'public, s-maxage=5, stale-while-revalidate=30' });
	const clock = Date.now();
	const client = statusClient(fetch);
	try {
		const [checks, now, history, daily, rangeRows] = await Promise.all([
			fetchChecks(client),
			fetchNow(client),
			fetchHistory(client, historyFloor(clock), 'gte'),
			fetchDaily(client, dayName(clock)),
			grain
				? Promise.all([
						fetchGrain(client, grain, new Date(rangeFloor(range, clock))),
						fetchGrain(client, RAW_GRAIN, new Date(rawFloor(range, clock))),
					]).then((parts) => parts.flat())
				: Promise.resolve([]),
		]);
		return { clock, range, checks, now, history, daily, rangeRows, unreachable: false };
	} catch {
		return {
			clock,
			range,
			checks: [],
			now: [],
			history: [],
			daily: [],
			rangeRows: [],
			unreachable: true,
		};
	}
};

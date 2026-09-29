import { historyFloor } from '$lib/board';
import { fetchChecks, fetchHistory, fetchNow, statusClient } from '$lib/source';
import type { PageServerLoad } from './$types';

/**
 * The first screen, whole, so it is what an index reads; the edge keeps a render a few seconds.
 * A database that does not answer renders an empty board saying so rather than an error page,
 * and the browser keeps asking. See spec/architecture/probe.md, "The page: one app, three doors".
 */
export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, s-maxage=5, stale-while-revalidate=30' });
	const clock = Date.now();
	const client = statusClient(fetch);
	try {
		const [checks, now, history] = await Promise.all([
			fetchChecks(client),
			fetchNow(client),
			fetchHistory(client, historyFloor(clock), 'gte'),
		]);
		return { clock, checks, now, history, unreachable: false };
	} catch {
		return { clock, checks: [], now: [], history: [], unreachable: true };
	}
};

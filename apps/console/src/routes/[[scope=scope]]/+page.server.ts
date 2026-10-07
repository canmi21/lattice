import { byNode, daily, figures, marks } from '#lib/overview/deploys.js';
import { heat, missing, perNode } from '#lib/overview/fleet.js';
import { fromRuns } from '#lib/overview/moving.js';
import { runsIn } from '#lib/scope/runs.js';
import { viewOf } from '#lib/scope/scope.js';
import { ALL, fleetSeries } from '#lib/server/fleet.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster } from '#lib/server/read.js';
import { type Range, range } from '#lib/server/reads.js';
import { RANGES } from '#lib/ui/segmented.svelte';
import type { PageServerLoad } from './$types';

/** What the fleet's charts draw, asked of every node in one request each. */
const METRICS = ['cpu.usage', 'memory.used', 'network.received', 'network.sent'];
const HOUR = 3600;
const DAYS = 30;

/**
 * The span at once; the cluster, the fleet's series over it and over the last day by the hour, and
 * every node's recent runs streamed, each card filling as its read lands. A node that does not
 * answer is a gap and a note. See spec/architecture/console.md, "Moving between pages never waits
 * for a node". The fleet's own charts are All's and Infra's, as the nodes are.
 */
export const load: PageServerLoad = async (event) => {
	const edge = edgeOf(event);
	const asked = event.url.searchParams.get('range');
	const chosen = (RANGES.find((one) => one.key === asked)?.key ?? '1h') as Range;
	const span = range(chosen);
	const day = range('24h', span.until);
	const { zone } = await event.parent();
	const view = viewOf(event.params.scope);
	const nodes = view === 'all' || view === 'infra';
	const history = runsIn(edge, view);
	const now = span.until * 1000;
	const month = now - DAYS * 86_400_000;
	const series = nodes ? fleetSeries(edge, { ...span, metrics: METRICS }) : undefined;
	const hours =
		chosen === '24h' || !nodes ? series : fleetSeries(edge, { ...day, metrics: ['cpu.usage'] });
	return {
		view,
		cluster: cluster(edge),
		range: chosen,
		span: { since: span.since, until: span.until },
		fleet: series
			? Promise.all([series, history]).then(([fleet, { runs }]) => ({
					cpu: perNode(fleet, 'cpu.usage'),
					memory: perNode(fleet, 'memory.used'),
					received: perNode(fleet, 'network.received'),
					sent: perNode(fleet, 'network.sent'),
					missing: missing(fleet),
					marks: marks(runs, span.since, span.until),
				}))
			: undefined,
		heat: hours?.then((read) => ({
			...heat(read, 'cpu.usage', { ...day, step: HOUR }),
			missing: missing(read),
		})),
		deploys: history.then(({ runs, failures }) => ({
			seen: runs.length,
			daily: daily(runs, now, zone, DAYS),
			outcomes: byNode(runs, ALL, month),
			figures: figures(runs, now, month),
			missing: Object.entries(failures).map(([node, failure]) => ({
				node,
				message: failure.message,
			})),
		})),
		moving: history.then(({ runs }) => fromRuns(runs)),
	};
};

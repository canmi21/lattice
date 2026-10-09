import { metric } from '#lib/chart/series.js';
import { marks } from '#lib/overview/deploys.js';
import { heat, missing, perNode } from '#lib/overview/fleet.js';
import { runsIn } from '#lib/scope/runs.js';
import { viewOf } from '#lib/scope/scope.js';
import type { Now } from '#lib/host.js';
import { ALL, fleetNow, fleetSeries } from '#lib/server/fleet.js';
import type { Node } from '#lib/server/nodes.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster, type Failure } from '#lib/server/read.js';
import { type Range, range } from '#lib/server/reads.js';
import { RANGES } from '#lib/ui/segmented.svelte';
import type { PageServerLoad } from './$types';

/** What the fleet's charts draw, asked of every node in one request each. */
const METRICS = ['cpu.usage', 'memory.used', 'network.received', 'network.sent'];
const HOUR = 3600;

/**
 * Every read streamed, so the page stands at once; see spec/architecture/console.md. The fleet's
 * charts over the chosen span, with each run started in it marked, and CPU by the hour over the
 * last day, came here from the overview -- spec/console/overview.md, "Charts are their pages'".
 */
export const load: PageServerLoad = (event) => {
	const edge = edgeOf(event);
	const asked = event.url.searchParams.get('range');
	const chosen = (RANGES.find((one) => one.key === asked)?.key ?? '1h') as Range;
	const span = range(chosen);
	const day = range('24h', span.until);
	const series = fleetSeries(edge, { ...span, metrics: METRICS });
	const hours = chosen === '24h' ? series : fleetSeries(edge, { ...day, metrics: ['cpu.usage'] });
	const history = runsIn(edge, viewOf(event.params.scope));
	const machines = fleetNow(edge).then((fleet) => {
		const known: Partial<Record<Node, Now>> = {};
		const failures: Partial<Record<Node, Failure>> = {};
		for (const name of ALL) {
			const machine = fleet[name];
			if (machine.ok) known[name] = machine.data;
			else failures[name] = machine.failure;
		}
		return { known, failures };
	});
	const trends = fleetSeries(edge, { ...range('1h'), metrics: ['cpu.usage'] }).then((cpu) => {
		const out: Partial<Record<Node, number[]>> = {};
		for (const name of ALL) {
			const series = cpu[name];
			if (series.ok) out[name] = metric(series.data, 'cpu.usage').map((point) => point.value);
		}
		return out;
	});
	return {
		cluster: cluster(edge),
		machines,
		trends,
		now: Date.now(),
		range: chosen,
		span: { since: span.since, until: span.until },
		fleet: Promise.all([series, history]).then(([fleet, { runs }]) => ({
			cpu: perNode(fleet, 'cpu.usage'),
			memory: perNode(fleet, 'memory.used'),
			received: perNode(fleet, 'network.received'),
			sent: perNode(fleet, 'network.sent'),
			missing: missing(fleet),
			marks: marks(runs, span.since, span.until),
		})),
		heat: hours.then((read) => ({
			...heat(read, 'cpu.usage', { ...day, step: HOUR }),
			missing: missing(read),
		})),
	};
};

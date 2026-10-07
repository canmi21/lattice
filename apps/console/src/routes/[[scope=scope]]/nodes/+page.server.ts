import { metric } from '#lib/chart/series.js';
import type { Now } from '#lib/host.js';
import { ALL, fleetNow, fleetSeries } from '#lib/server/fleet.js';
import type { Node } from '#lib/server/nodes.js';
import { edgeOf } from '#lib/server/platform.js';
import { cluster, type Failure } from '#lib/server/read.js';
import { range } from '#lib/server/reads.js';
import type { PageServerLoad } from './$types';

/** Every read streamed, so the page stands at once; see spec/architecture/console.md. */
export const load: PageServerLoad = (event) => {
	const edge = edgeOf(event);
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
	return { cluster: cluster(edge), machines, trends, now: Date.now() };
};

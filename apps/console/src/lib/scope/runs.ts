/**
 * The runs of one view: src/lib/server/runs.ts's `runs()`, with the events of the apps the view
 * does not show left out before they are grouped, so a run's counts are the view's own.
 */
import { ALL, fleetEvents, type FleetEvent } from '../server/fleet.ts';
import type { Edge } from '../server/read.ts';
import { group, type Runs } from '../server/runs.ts';
import { type View, shows } from './scope.ts';

/** As `runs()` asks: every node's last 500 events, the most host answers for at once. */
export const LIMIT = 500 * ALL.length;

export const inView =
	(view: View) =>
	({ app }: Pick<FleetEvent, 'app'>): boolean =>
		shows(view, app);

export async function runsIn(edge: Edge, view: View): Promise<Runs> {
	const { events, failures } = await fleetEvents(edge, { limit: LIMIT });
	return { ...group(view === 'all' ? events : events.filter(inView(view))), failures };
}

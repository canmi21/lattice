/**
 * The runs of one view: src/lib/server/runs.ts's `runs()`, with the events of the apps the view
 * does not show left out before they are grouped, so a run's counts are the view's own.
 */
import type { FleetEvent } from '../server/fleet.ts';
import type { Bounded, Edge } from '../server/read.ts';
import { group, rows, type Runs } from '../server/runs.ts';
import { type View, shows } from './scope.ts';

export const inView =
	(view: View) =>
	({ app }: Pick<FleetEvent, 'app'>): boolean =>
		shows(view, app);

export async function runsIn(edge: Edge, view: View, ask: Bounded = {}): Promise<Runs> {
	const { events, failures } = await rows(edge, ask);
	return { ...group(view === 'all' ? events : events.filter(inView(view))), failures };
}

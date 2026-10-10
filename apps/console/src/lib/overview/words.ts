/**
 * What a reader is told a run did, never the words host and the relay write it in: `succeeded`
 * is `Done`, `running` is `In progress`. See spec/console/overview.md, "The week is a line a node".
 */
import type { Outcome } from './timeline.ts';

export const OUTCOME: Readonly<Record<Outcome, string>> = {
	succeeded: 'Done',
	running: 'In progress',
	mixed: 'Partly failed',
	failed: 'Failed',
};

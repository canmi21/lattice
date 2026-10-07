/**
 * Whether what the live store holds says the page's runs have moved: a run deploying somewhere, or
 * one newer than `newest`, the newest the page loaded. Either is a reason to read the page again;
 * `only` narrows both to one run.
 */
import type { Held } from '../wire.ts';

export function stirring(
	nodes: Readonly<Record<string, Held>>,
	newest: number | undefined,
	only?: number,
): boolean {
	return Object.values(nodes).some((held) =>
		held.snapshot.events.some(
			({ source: { kind, run }, outcome }) =>
				kind === 'run' &&
				run !== undefined &&
				(only === undefined || run === only) &&
				(outcome === 'running' || newest === undefined || run > newest),
		),
	);
}

/**
 * What a node's mark says: its size how much machine stands at its place, its depth how much it
 * runs, its breathing how busy it is now, its color whether it is heard, leaving or gone. The globe
 * takes all but the breathing. See spec/architecture/console.md, the paragraph on the world map.
 */
import type { State } from '../wire.ts';

/**
 * What a mark shows of a node's state: heard, `live` or `late`, a late node being only between two
 * snapshots; leaving, back within its `within`; waiting, not heard yet by a relay just started; and
 * gone. See spec/architecture/console.md, "A node has three states on the map".
 */
export type Shown = 'live' | 'leaving' | 'waiting' | 'gone';

export function shown(state: State): Shown {
	if (state === 'live' || state === 'late') return 'live';
	if (state === 'upgrading' || state === 'restarting') return 'leaving';
	return state;
}

/** Worst first, which a place takes of its nodes: gone, then leaving, then waiting, then heard. */
const WORST: readonly Shown[] = ['gone', 'leaving', 'waiting', 'live'];

/** The worst of `states`; heard where there are none. */
export function worst(states: readonly Shown[]): Shown {
	return WORST.find((state) => states.includes(state)) ?? 'live';
}

/**
 * GiB of memory standing at a place, below which each radius in the flat map's viewBox units
 * holds, the first step taking its top as well: up to 2, under 8, and 8 or more. The smallest
 * spans two of the land's dots, a pitch and a dot (scripts/project.ts).
 */
export const SIZES = [
	{ gib: 2, radius: 7 },
	{ gib: 8, radius: 9.5 },
	{ gib: Infinity, radius: 12 },
] as const;

/** Apps running, at most, for each opacity; the last has no top. */
export const DEPTHS = [
	{ apps: 5, opacity: 0.45 },
	{ apps: 15, opacity: 0.72 },
	{ apps: Infinity, opacity: 1 },
] as const;

/** CPU percent now, below which each breathing period holds, in seconds: the busier, the faster. */
export const BREATHS = [
	{ below: 2, period: 4 },
	{ below: 10, period: 2.6 },
	{ below: 30, period: 1.6 },
	{ below: Infinity, period: 0.9 },
] as const;

const GIB = 2 ** 30;

/** A mark's radius for the bytes of memory at its place; not knowing gives the middle step. */
export function radius(bytes: number | undefined): number {
	if (bytes === undefined || !Number.isFinite(bytes)) return SIZES[1].radius;
	const gib = bytes / GIB;
	if (gib <= SIZES[0].gib) return SIZES[0].radius;
	return (SIZES.find((size) => gib < size.gib) ?? SIZES[2]).radius;
}

/** A mark's opacity for the apps running on its node; not knowing gives the middle step. */
export function opacity(apps: number | undefined): number {
	if (apps === undefined || !Number.isFinite(apps)) return DEPTHS[1].opacity;
	return (DEPTHS.find((depth) => apps <= depth.apps) ?? DEPTHS[2]).opacity;
}

/** A mark's breathing period for its node's CPU percent now; not knowing gives the slowest. */
export function period(cpu: number | undefined): number {
	if (cpu === undefined || !Number.isFinite(cpu)) return BREATHS[0].period;
	return (BREATHS.find((breath) => cpu < breath.below) ?? BREATHS[3]).period;
}

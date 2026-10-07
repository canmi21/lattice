/**
 * What the map says of each node beyond where it is: its place and its role in the relay, and how
 * nodes in one place gather into one mark. A `Record<Node, ...>`, so a node added to
 * `server/nodes.ts` fails the type check here until it is placed. A role is one of the relay's
 * three core nodes, a relay, or the relay at home, which may go offline -- see platform's
 * spec/architecture/relay.md.
 */
import type { Node } from '../server/nodes.ts';
import type { Shown } from './marks.ts';

export type Role = 'core' | 'relay' | 'home';

export interface Place {
	place: string;
	role: Role;
	/** The place it shares with other nodes, which the map draws as one mark (`CLUSTERS`). */
	cluster?: string;
}

export const PLACES: Record<Node, Place> = {
	tyo: { place: 'Tokyo', role: 'core', cluster: 'tokyo' },
	nrt: { place: 'Tokyo, Narita', role: 'relay', cluster: 'tokyo' },
	hnd: { place: 'Tokyo, Haneda', role: 'relay', cluster: 'tokyo' },
	gvx: { place: 'Gävle', role: 'core' },
	bru: { place: 'Brussels', role: 'relay' },
	buf: { place: 'Buffalo', role: 'core' },
	rdu: { place: 'Raleigh', role: 'home' },
};

/** Each shared place by the name its mark's card gives it. */
export const CLUSTERS: Record<string, string> = { tokyo: 'Tokyo' };

export const ROLES: Record<Role, string> = { core: 'Core', relay: 'Relay', home: 'Home' };

/** Who leads a place by role, before the apps running and the node order. */
const STANDING: Record<Role, number> = { core: 0, relay: 1, home: 2 };

/** One node as its place's mark reads it. */
export interface Member {
	code: string;
	role: Role;
	cluster: string | undefined;
	state: Shown;
	/** Apps running, of how many listed. */
	apps: { running: number; total: number } | undefined;
	/** Total and used memory in bytes, and CPU percent now. */
	memory: number | undefined;
	used: number | undefined;
	cpu: number | undefined;
	/** When it was last heard; never, where it has not been. */
	heard: string | undefined;
	point: readonly [number, number];
}

/** A place as the map marks it: one node alone, or every node sharing it. */
export interface Site {
	/** The cluster, or the code of the node alone. */
	key: string;
	/** Its nodes, the one that leads first. */
	members: Member[];
	point: [number, number];
	/** Memory and apps running summed over what is known, and the busiest CPU known. */
	memory: number | undefined;
	apps: number | undefined;
	cpu: number | undefined;
	/** Gone if any of its nodes is gone. */
	state: Shown;
}

/** Members in the order a place reads them: role, then more apps running, then node order. */
export function rank(members: readonly Member[]): Member[] {
	return members
		.map((member, order) => ({ member, order }))
		.toSorted(
			(a, b) =>
				STANDING[a.member.role] - STANDING[b.member.role] ||
				(b.member.apps?.running ?? -1) - (a.member.apps?.running ?? -1) ||
				a.order - b.order,
		)
		.map(({ member }) => member);
}

/** Every node gathered into its place's site, in node order of each place's first node. */
export function gather(members: readonly Member[]): Site[] {
	const places = new Map<string, Member[]>();
	for (const member of members) {
		const key = member.cluster ?? member.code;
		places.set(key, [...(places.get(key) ?? []), member]);
	}
	return [...places].map(([key, group]) => {
		const known = <T>(read: (member: Member) => T | undefined) =>
			group.flatMap((member) => {
				const value = read(member);
				return value === undefined ? [] : [value];
			});
		const sum = (values: number[]) =>
			values.length ? values.reduce((a, b) => a + b, 0) : undefined;
		const cpus = known((member) => member.cpu);
		const mean = (axis: 0 | 1) =>
			group.reduce((total, { point }) => total + point[axis], 0) / group.length;
		return {
			key,
			members: rank(group),
			point: [mean(0), mean(1)],
			memory: sum(known((member) => member.memory)),
			apps: sum(known((member) => member.apps?.running)),
			cpu: cpus.length ? Math.max(...cpus) : undefined,
			state: group.some((member) => member.state === 'gone') ? 'gone' : 'live',
		};
	});
}

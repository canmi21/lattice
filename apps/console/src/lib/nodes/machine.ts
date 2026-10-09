/**
 * One node as a row of the nodes table: what is declared of it, whether it is heard, and the
 * meter's readings, the live snapshot's where it carries them and the server's read otherwise.
 */
import type { Now } from '../host.ts';
import { nameOf, type Role, PLACES } from '../map/places.ts';
import { heldOf, readings, running, stateOf } from '../node.ts';
import type { Node } from '../server/nodes.ts';
import type { Entry, State } from '../wire.ts';
import { FACTS, type Facts } from './facts.ts';

/** The meter's `{ info, sample }`, or nothing where `machine` is not that shape. */
export function machineOf(machine: unknown): Now | undefined {
	if (typeof machine !== 'object' || machine === null) return undefined;
	const { info, sample } = machine as Partial<Now>;
	const usable =
		typeof info?.cores === 'number' &&
		typeof info.memory === 'number' &&
		typeof sample?.at === 'number' &&
		typeof sample.values === 'object' &&
		sample.values !== null;
	return usable ? (machine as Now) : undefined;
}

/**
 * The architecture a kernel release names, as Debian's and the upstream kernels spell it; the
 * meter does not read one, so a release that names none says nothing.
 */
export function architecture(kernel: string | null | undefined): string | undefined {
	if (!kernel) return undefined;
	if (/\b(arm64|aarch64)\b/.test(kernel)) return 'arm64';
	if (/\b(amd64|x86_64)\b/.test(kernel)) return 'amd64';
	return undefined;
}

/** Seconds the machine has been up as of `now` in milliseconds, or nothing where unknown. */
export function uptime(booted: number | null | undefined, now: number): number | undefined {
	if (typeof booted !== 'number' || booted <= 0) return undefined;
	return Math.max(0, now / 1000 - booted);
}

export interface NodeRow {
	code: Node;
	/** Its display name, which other nodes may share; `code` is the key. */
	name: string;
	place: string;
	role: Role;
	facts: Facts;
	architecture?: string;
	/** As the relay says it; `gone` for a node it holds nothing of, whose `heardAt` is absent. */
	state: State;
	heardAt?: string;
	/** Percent, 0 to 100. */
	cpu?: number;
	load?: number;
	memory?: { used: number; total?: number };
	storage?: { used: number; total?: number };
	apps?: { running: number; total: number };
	/** Seconds up. */
	uptime?: number;
	cores?: number;
}

/** The machine the live snapshot carries, else the one the server read. */
export function machineFor(held: Entry | undefined, read: Now | undefined): Now | undefined {
	return machineOf(held?.snapshot?.machine) ?? read;
}

export function nodeRow(
	code: Node,
	entry: Entry | undefined,
	read: Now | undefined,
	now: number,
): NodeRow {
	const held = heldOf(entry);
	const machine = machineFor(held, read);
	const measured = machine ? readings(machine) : undefined;
	return {
		code,
		name: nameOf(code).full,
		place: PLACES[code].place,
		role: PLACES[code].role,
		facts: FACTS[code],
		architecture: architecture(machine?.info.kernel),
		state: stateOf(entry, now),
		heardAt: held?.heard_at,
		cpu: measured?.cpu,
		load: measured?.load,
		memory: measured?.memory,
		storage: measured?.disk,
		apps: held ? running(held) : undefined,
		uptime: uptime(machine?.info.booted, now),
		cores: machine?.info.cores,
	};
}

/** `used` as a percentage of `total`, NaN where either is unknown, so it sorts last. */
export function share(amount: { used: number; total?: number } | undefined): number {
	return amount?.total ? (amount.used / amount.total) * 100 : Number.NaN;
}

/**
 * One node as its card reads it: its state as the relay says it, and the few machine readings
 * worth a glance. The readings are the meter's, as infra's apps/deploy/panel reads them.
 */
import type { Entry, Held, State } from './wire.ts';

const STATES: ReadonlySet<string> = new Set<State>([
	'live',
	'late',
	'upgrading',
	'restarting',
	'waiting',
	'gone',
]);

/**
 * What the relay says of a node, and gone for one it holds nothing of. The relay reads it and the
 * browser never does -- spec/architecture/console.md, "A node has three states on the map".
 */
export function stateOf(entry: Entry | undefined, now: number): State {
	if (entry?.state !== undefined && STATES.has(entry.state)) return entry.state;
	if (entry?.heard_at === undefined) return 'gone';
	return heardSince(entry.heard_at, now);
}

/** What `entry` holds of its node, and nothing for a peer its relay has not heard. */
export function heldOf(entry: Entry | undefined): Held | undefined {
	return entry?.version === undefined ? undefined : entry;
}

/**
 * The rollout's stand-in, for a relay on the build before `state`: removed once every relay sends
 * it -- platform's spec/architecture/relay.md, "A node says it is leaving before it goes".
 */
function heardSince(heardAt: string, now: number): State {
	const heard = Date.parse(heardAt);
	if (Number.isNaN(heard)) return 'gone';
	const silent = now - heard;
	if (silent <= 10_000) return 'live';
	if (silent <= 60_000) return 'late';
	return 'gone';
}

export interface Readings {
	/** Percent, 0 to 100. */
	cpu?: number;
	load?: number;
	/** Bytes used, and of how many where the meter says. */
	memory?: { used: number; total?: number };
	disk?: { used: number; total?: number };
	/** When the machine started, in seconds since the epoch. */
	booted?: number;
}

/** What the meter's `{ info, sample }` says of the machine, or nothing where it is not that. */
export function readings(machine: unknown): Readings | undefined {
	if (!isRecord(machine) || !isRecord(machine.sample) || !isRecord(machine.sample.values)) {
		return undefined;
	}
	const values = machine.sample.values;
	const info = isRecord(machine.info) ? machine.info : {};
	const used = (metric: string, total: unknown) => {
		const value = values[metric];
		if (typeof value !== 'number') return undefined;
		return { used: value, total: typeof total === 'number' && total > 0 ? total : undefined };
	};
	const number = (metric: string) =>
		typeof values[metric] === 'number' ? (values[metric] as number) : undefined;
	return {
		cpu: number('cpu.usage'),
		load: number('load.1'),
		memory: used('memory.used', info.memory),
		disk: used('storage.used', info.storage),
		booted: typeof info.booted === 'number' && info.booted > 0 ? info.booted : undefined,
	};
}

/** Running and total, of the apps a node lists. */
export function running(held: Held): { running: number; total: number } {
	const apps = held.snapshot.apps;
	return { running: apps.filter((app) => app.running).length, total: apps.length };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

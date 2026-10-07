/**
 * One node as its card reads it: whether it is still heard, and the few machine readings worth a
 * glance. The readings are the meter's, as infra's apps/deploy/panel reads them.
 */
import type { Held } from './wire.ts';

/** A live node moves about every three seconds; see platform's spec/architecture/relay.md. */
export const LIVE_MS = 10_000;
/** Silent this long, the node or every path to it is down. */
export const GONE_MS = 60_000;

export type Liveness = 'live' | 'late' | 'gone';

/** How recently `heardAt` is, as of `now`; a time this browser cannot read is gone. */
export function liveness(heardAt: string, now: number): Liveness {
	const heard = Date.parse(heardAt);
	if (Number.isNaN(heard)) return 'gone';
	const silent = now - heard;
	if (silent <= LIVE_MS) return 'live';
	if (silent <= GONE_MS) return 'late';
	return 'gone';
}

export interface Readings {
	/** Percent, 0 to 100. */
	cpu?: number;
	load?: number;
	/** Bytes used, and of how many where the meter says. */
	memory?: { used: number; total?: number };
	disk?: { used: number; total?: number };
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

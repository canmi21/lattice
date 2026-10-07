import { describe, expect, it } from 'vitest';
import type { Now } from '../host.ts';
import type { Held } from '../wire.ts';
import { architecture, machineFor, machineOf, nodeRow, share, uptime } from './machine.ts';

const HEARD = '2026-10-06T12:00:00Z';
const NOW = Date.parse(HEARD) + 2000;

const machine = (cpu: number): Now => ({
	info: {
		model: null,
		kernel: '6.1.0-25-arm64',
		cores: 4,
		clusters: [],
		memory: 8 * 2 ** 30,
		swap: 0,
		storage: 100 * 2 ** 30,
		booted: NOW / 1000 - 3600,
	},
	sample: { at: NOW / 1000, values: { 'cpu.usage': cpu, 'memory.used': 2 ** 30, 'load.1': 0.5 } },
});

const held = (snapshot: Partial<Held['snapshot']> = {}): Held => ({
	version: 1,
	heard_at: HEARD,
	snapshot: { taken_at: HEARD, events: [], apps: [], ...snapshot },
});

describe('machineOf', () => {
	it('takes the meter shape and nothing else', () => {
		expect(machineOf(machine(10))).toEqual(machine(10));
		expect(machineOf({ info: {}, sample: {} })).toBeUndefined();
		expect(machineOf(undefined)).toBeUndefined();
	});
});

describe('machineFor', () => {
	it('prefers what the live snapshot carries over what the server read', () => {
		expect(machineFor(held({ machine: machine(70) }), machine(10))?.sample.values).toMatchObject({
			'cpu.usage': 70,
		});
		expect(machineFor(held(), machine(10))?.sample.values['cpu.usage']).toBe(10);
		expect(machineFor(undefined, undefined)).toBeUndefined();
	});
});

describe('architecture', () => {
	it('reads the architecture a kernel release names, and guesses none', () => {
		expect(architecture('6.1.0-25-arm64')).toBe('arm64');
		expect(architecture('6.8.0-1012-aarch64')).toBe('arm64');
		expect(architecture('6.1.0-25-amd64')).toBe('amd64');
		expect(architecture('6.6.32-0-virt')).toBeUndefined();
		expect(architecture(null)).toBeUndefined();
	});
});

describe('uptime', () => {
	it('counts from boot, and knows nothing without it', () => {
		expect(uptime(NOW / 1000 - 90, NOW)).toBe(90);
		expect(uptime(null, NOW)).toBeUndefined();
		expect(uptime(0, NOW)).toBeUndefined();
	});
});

describe('nodeRow', () => {
	it('puts the declared, the heard and the measured together', () => {
		const row = nodeRow('tyo', held({ apps: [] }), machine(25), NOW);
		expect(row).toMatchObject({
			code: 'tyo',
			place: 'Tokyo',
			role: 'core',
			architecture: 'arm64',
			state: 'live',
			cpu: 25,
			load: 0.5,
			memory: { used: 2 ** 30, total: 8 * 2 ** 30 },
			apps: { running: 0, total: 0 },
			uptime: 3600,
			cores: 4,
		});
		expect(row.facts.domain).toBe('oci');
	});

	it('counts a node the relay holds nothing of as gone, never heard', () => {
		const row = nodeRow('rdu', undefined, undefined, NOW);
		expect(row.state).toBe('gone');
		expect(row.heardAt).toBeUndefined();
		expect(row.cpu).toBeUndefined();
		expect(row.facts.expiry).toBeUndefined();
	});
});

describe('share', () => {
	it('is a percentage where a total is known, and NaN so it sorts last otherwise', () => {
		expect(share({ used: 1, total: 4 })).toBe(25);
		expect(share({ used: 1 })).toBeNaN();
		expect(share(undefined)).toBeNaN();
	});
});

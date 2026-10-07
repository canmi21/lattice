import { describe, expect, it } from 'vitest';
import { liveness, readings } from './node.ts';

const HEARD = '2026-10-06T12:00:00Z';
const at = (seconds: number) => Date.parse(HEARD) + seconds * 1000;

describe('liveness', () => {
	it('is live within ten seconds, late within a minute, and gone after', () => {
		expect(liveness(HEARD, at(0))).toBe('live');
		expect(liveness(HEARD, at(10))).toBe('live');
		expect(liveness(HEARD, at(11))).toBe('late');
		expect(liveness(HEARD, at(60))).toBe('late');
		expect(liveness(HEARD, at(61))).toBe('gone');
	});

	it('counts a heard_at ahead of this browser clock as live', () => {
		expect(liveness(HEARD, at(-5))).toBe('live');
	});

	it('counts a time it cannot read as gone', () => {
		expect(liveness('yesterday', at(0))).toBe('gone');
	});
});

describe('readings', () => {
	it('reads the meter as host passes it on, each total where info has one', () => {
		const machine = {
			info: { cores: 2, memory: 8 * 2 ** 30, storage: 0 },
			sample: { at: 104, values: { 'cpu.usage': 12.5, 'memory.used': 2 ** 30, 'storage.used': 5 } },
		};
		expect(readings(machine)).toEqual({
			cpu: 12.5,
			load: undefined,
			memory: { used: 2 ** 30, total: 8 * 2 ** 30 },
			// A storage of zero is the meter not knowing, not a full disk.
			disk: { used: 5, total: undefined },
		});
	});

	it('reads nothing from a node with no meter, or from a shape it does not know', () => {
		expect(readings(undefined)).toBeUndefined();
		expect(readings({ sample: 1 })).toBeUndefined();
	});
});

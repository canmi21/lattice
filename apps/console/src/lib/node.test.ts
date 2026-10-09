import { describe, expect, it } from 'vitest';
import { readings, stateOf } from './node.ts';
import type { Held, State } from './wire.ts';

const HEARD = '2026-10-06T12:00:00Z';
const at = (seconds: number) => Date.parse(HEARD) + seconds * 1000;
const held = (state?: State, heardAt = HEARD): Held => ({
	version: 1,
	heard_at: heardAt,
	snapshot: { taken_at: heardAt, events: [], apps: [] },
	state,
});

describe("a node's state", () => {
	it("is what the relay says, whatever this browser's clock reads", () => {
		expect(stateOf(held('upgrading'), at(600))).toBe('upgrading');
		expect(stateOf(held('waiting'), at(0))).toBe('waiting');
		expect(stateOf(held('live'), at(600))).toBe('live');
		expect(stateOf(held('gone'), at(0))).toBe('gone');
	});

	it('is gone for a node the relay holds nothing of, and its own word for one not heard', () => {
		expect(stateOf(undefined, at(0))).toBe('gone');
		expect(stateOf({ state: 'waiting' }, at(0))).toBe('waiting');
		expect(stateOf({ state: 'gone' }, at(0))).toBe('gone');
	});

	describe('from a relay on the build before it sends one', () => {
		it('is live within ten seconds, late within a minute, and gone after', () => {
			expect(stateOf(held(), at(0))).toBe('live');
			expect(stateOf(held(), at(10))).toBe('live');
			expect(stateOf(held(), at(11))).toBe('late');
			expect(stateOf(held(), at(60))).toBe('late');
			expect(stateOf(held(), at(61))).toBe('gone');
		});

		it('counts a heard_at ahead of this browser clock as live', () => {
			expect(stateOf(held(), at(-5))).toBe('live');
		});

		it('counts a time it cannot read as gone', () => {
			expect(stateOf(held(undefined, 'yesterday'), at(0))).toBe('gone');
		});

		it('reads a word it does not know the same way, as a relay newer than it may send', () => {
			expect(stateOf(held('sleeping' as State), at(30))).toBe('late');
		});
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

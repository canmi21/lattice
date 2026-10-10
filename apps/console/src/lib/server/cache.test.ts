import { describe, expect, it, vi } from 'vitest';
import { kept, memoryStore, toMinute } from './cache.ts';

describe('the edge cache of the backend reads', () => {
	const counter = () => {
		let n = 0;
		return vi.fn(async () => ({ ok: true, n: ++n }));
	};
	const answered = (read: { ok: boolean }) => read.ok;

	it('answers from the store while a read is fresh, and reads again once it is not', async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			const read = counter();
			expect(await kept({ store }, 'runs', 5, read, answered)).toEqual({ ok: true, n: 1 });
			expect(await kept({ store }, 'runs', 5, read, answered)).toEqual({ ok: true, n: 1 });
			vi.advanceTimersByTime(5001);
			expect(await kept({ store }, 'runs', 5, read, answered)).toEqual({ ok: true, n: 2 });
		} finally {
			vi.useRealTimers();
		}
	});

	it('goes past the store when asked fresh, and keeps what it brings for the next', async () => {
		const store = memoryStore();
		const read = counter();
		await kept({ store }, 'runs', 5, read, answered);
		expect(await kept({ store, fresh: true }, 'runs', 5, read, answered)).toEqual({
			ok: true,
			n: 2,
		});
		expect(await kept({ store }, 'runs', 5, read, answered)).toEqual({ ok: true, n: 2 });
	});

	it('keeps no read that failed, and nothing without a store', async () => {
		const store = memoryStore();
		const failing = vi.fn(async () => ({ ok: false }));
		await kept({ store }, 'runs', 5, failing, answered);
		await kept({ store }, 'runs', 5, failing, answered);
		expect(failing).toHaveBeenCalledTimes(2);
		const read = counter();
		await kept({}, 'runs', 5, read, answered);
		await kept({}, 'runs', 5, read, answered);
		expect(read).toHaveBeenCalledTimes(2);
	});

	it('keeps a span until the next whole minute', () => {
		expect(toMinute(Date.parse('2026-10-10T12:00:59.200Z'))).toBe(1);
		expect(toMinute(Date.parse('2026-10-10T12:00:00.000Z'))).toBe(60);
		expect(toMinute(Date.parse('2026-10-10T12:00:30.500Z'))).toBe(30);
	});
});

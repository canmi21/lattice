import { expect, it, vi } from 'vitest';
import { createBatcher } from './batch';

function answering(calls: string[][]) {
	return async (keys: string[]) => {
		calls.push(keys);
		return new Map(keys.map((key) => [key, key.toUpperCase()]));
	};
}

it('answers several lookups in one request, and each caller gets its own key', async () => {
	vi.useFakeTimers();
	const calls: string[][] = [];
	const lookup = createBatcher({ window: 40, limit: 10, run: answering(calls) });

	const waiting = Promise.all([lookup('a'), lookup('b'), lookup('c')]);
	await vi.advanceTimersByTimeAsync(40);

	expect(await waiting).toEqual(['A', 'B', 'C']);
	expect(calls).toEqual([['a', 'b', 'c']]);
	vi.useRealTimers();
});

// A sweep crosses the same card twice as often as not, and the second crossing is not a second
// question.
it('asks once for a key asked for twice inside one window', async () => {
	vi.useFakeTimers();
	const calls: string[][] = [];
	const lookup = createBatcher({ window: 40, limit: 10, run: answering(calls) });

	const waiting = Promise.all([lookup('a'), lookup('a')]);
	await vi.advanceTimersByTimeAsync(40);

	expect(await waiting).toEqual(['A', 'A']);
	expect(calls).toEqual([['a']]);
	vi.useRealTimers();
});

// Waiting out the window would only delay a request whose shape is already settled.
it('sends a full batch without waiting, and starts a new one after it', async () => {
	vi.useFakeTimers();
	const calls: string[][] = [];
	const lookup = createBatcher({ window: 40, limit: 2, run: answering(calls) });

	const first = Promise.all([lookup('a'), lookup('b')]);
	expect(await first).toEqual(['A', 'B']);
	expect(calls).toEqual([['a', 'b']]);

	const second = lookup('c');
	await vi.advanceTimersByTimeAsync(40);
	expect(await second).toBe('C');
	expect(calls).toHaveLength(2);
	vi.useRealTimers();
});

// A key the server has no answer for is absent from the map rather than an error: the caller
// asked whether something exists, and nothing is an answer.
it('resolves a key the answer does not carry as nothing', async () => {
	vi.useFakeTimers();
	const lookup = createBatcher<string>({
		window: 40,
		limit: 10,
		run: async () => new Map([['a', 'A']]),
	});

	const waiting = Promise.all([lookup('a'), lookup('missing')]);
	await vi.advanceTimersByTimeAsync(40);
	expect(await waiting).toEqual(['A', undefined]);
	vi.useRealTimers();
});

it('fails every caller in a batch that failed, and recovers on the next', async () => {
	vi.useFakeTimers();
	let attempt = 0;
	const lookup = createBatcher<string>({
		window: 40,
		limit: 10,
		run: async (keys) => {
			attempt += 1;
			if (attempt === 1) throw new Error('offline');
			return new Map(keys.map((key) => [key, key.toUpperCase()]));
		},
	});

	const failing = Promise.allSettled([lookup('a'), lookup('b')]);
	await vi.advanceTimersByTimeAsync(40);
	expect((await failing).map(({ status }) => status)).toEqual(['rejected', 'rejected']);

	const recovered = lookup('c');
	await vi.advanceTimersByTimeAsync(40);
	expect(await recovered).toBe('C');
	vi.useRealTimers();
});

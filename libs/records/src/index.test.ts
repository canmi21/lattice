import type { Store } from '@canmi/kit/behavior/state';
import { describe, expect, it } from 'vitest';
import { reader, tab } from './index.ts';

const CLIP = '766abd9d564851362536c6db951e3ce7';
const OTHER = 'cda778566d1e4b0f9a1c2e3d4f5a6b7c';

function store(): Store {
	const items = new Map<string, string>();
	return {
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value),
	};
}

describe('the records', () => {
	it("stand at the versions already in readers' storage", () => {
		// A version a reader already holds can only move up; these are the ones written so far.
		expect(reader.version).toBe(1);
		expect(tab.version).toBe(2);
	});
});

describe('the tab step from one shape of `video.at` to the next', () => {
	it('carries positions across and leaves nothing of the old shape', () => {
		const session = store();
		session.setItem(
			'state',
			JSON.stringify({ version: 1, 'video.at': { [CLIP]: 12.4, [OTHER]: -1 }, keep: 'me' }),
		);
		expect(tab.recall(session, 'video.at', {})).toEqual({ [CLIP]: { at: 12.4 } });
		expect(tab.recall(session, 'keep', '')).toBe('me');
	});

	it('discards a `video.at` that was never a map', () => {
		const session = store();
		session.setItem('state', JSON.stringify({ version: 1, 'video.at': 'nonsense', keep: 'me' }));
		tab.remember(session, 'keep', 'still');
		expect(JSON.parse(session.getItem('state') ?? '{}')).toEqual({ version: 2, keep: 'still' });
	});
});

import { beforeEach, describe, expect, it } from 'vitest';
import { keepPosition, positionOf } from './progress';
import { tab, type Store } from './state';

function store(): Store & { items: Map<string, string> } {
	const items = new Map<string, string>();
	return {
		items,
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value),
	};
}

const CLIP = '766abd9d564851362536c6db951e3ce7';
const OTHER = 'cda778566d1e4b0f9a1c2e3d4f5a6b7c';

describe('where a clip had got to', () => {
	let session: ReturnType<typeof store>;
	beforeEach(() => (session = store()));

	it('is nothing until something is kept', () => {
		expect(positionOf(session, CLIP)).toBeUndefined();
	});

	it('comes back for the clip it was filed under, and not for another', () => {
		keepPosition(session, CLIP, 12.4, 25);
		expect(positionOf(session, CLIP)).toBe(12.4);
		expect(positionOf(session, OTHER)).toBeUndefined();
	});

	it('is one key holding a map, inside the tab record', () => {
		keepPosition(session, CLIP, 12.4, 25);
		keepPosition(session, OTHER, 3, 25);
		expect(session.items.size).toBe(1);
		expect(tab.recall(session, 'video.at', {})).toEqual({ [CLIP]: 12.4, [OTHER]: 3 });
	});

	it('is not kept at all below the floor, because a third of a second is noise', () => {
		keepPosition(session, CLIP, 0.3, 25);
		expect(positionOf(session, CLIP)).toBeUndefined();
	});

	it('is dropped once the clip has finished, so a finished clip starts again', () => {
		keepPosition(session, CLIP, 12.4, 25);
		keepPosition(session, CLIP, 24.8, 25);
		expect(positionOf(session, CLIP)).toBeUndefined();
	});

	it('is dropped when the reader seeks back to the start', () => {
		keepPosition(session, CLIP, 12.4, 25);
		keepPosition(session, CLIP, 0, 25);
		expect(positionOf(session, CLIP)).toBeUndefined();
	});

	it('survives a duration nobody has measured yet', () => {
		// `duration` is NaN until metadata lands, and a clip paused before then still has a
		// position worth keeping.
		keepPosition(session, CLIP, 12.4, Number.NaN);
		expect(positionOf(session, CLIP)).toBe(12.4);
	});

	it('ignores anything in the map that is not a position', () => {
		// Another build, another tab's idea of this key, or a reader with a console. One NaN
		// reaching `currentTime` throws, and the check is per value because `recall` can only say
		// whether the record holds a map at all.
		tab.remember(session, 'video.at', {
			[CLIP]: 'twelve',
			[OTHER]: 4,
			nope: null,
			never: Number.NaN,
			negative: -3,
		});
		expect(positionOf(session, CLIP)).toBeUndefined();
		expect(positionOf(session, OTHER)).toBe(4);
		expect(positionOf(session, 'nope')).toBeUndefined();
		expect(positionOf(session, 'never')).toBeUndefined();
		expect(positionOf(session, 'negative')).toBeUndefined();
	});

	it('leaves the rest of the tab record alone', () => {
		tab.remember(session, 'support.preferred', true);
		keepPosition(session, CLIP, 12.4, 25);
		expect(tab.recall(session, 'support.preferred', false)).toBe(true);
	});
});

import { describe, expect, it } from 'vitest';
import { hrefOf, olderThan, viewOf } from './view.ts';

const query = (text: string) => new URLSearchParams(text);

describe('viewOf', () => {
	it('reads the tab, the range and the page start', () => {
		expect(viewOf(query('tab=events&range=7d&before=40'))).toEqual({
			tab: 'events',
			range: '7d',
			before: 40,
		});
	});

	it('falls back to the overview over the last hour on what it does not know', () => {
		expect(viewOf(query('tab=nope&range=2y&before=-3'))).toEqual({ tab: 'overview', range: '1h' });
		expect(viewOf(query('before=1.5'))).toEqual({ tab: 'overview', range: '1h' });
	});
});

describe('hrefOf', () => {
	it('writes only what differs from the defaults, and reads back as it was', () => {
		expect(hrefOf({ tab: 'overview', range: '1h' })).toBe('?');
		const view = { tab: 'events', range: '24h', before: 9 } as const;
		expect(hrefOf(view)).toBe('?tab=events&range=24h&before=9');
		expect(viewOf(query(hrefOf(view).slice(1)))).toEqual(view);
	});
});

describe('olderThan', () => {
	it('starts the next page below the lowest id, and none after a short page', () => {
		expect(olderThan([9, 7, 8], 3)).toBe(7);
		expect(olderThan([9, 8], 3)).toBeUndefined();
		expect(olderThan([], 3)).toBeUndefined();
	});
});

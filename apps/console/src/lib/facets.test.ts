import { describe, expect, it } from 'vitest';
import { NAMES } from './facets.ts';
import { FACETS } from './server/facets.ts';

describe('the facets the browser asks', () => {
	it('are the facets the server cuts, every one', () => {
		expect([...NAMES].toSorted()).toEqual(Object.keys(FACETS).toSorted());
	});
});

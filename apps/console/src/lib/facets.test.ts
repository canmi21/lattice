import { describe, expect, it } from 'vitest';
import { NAMES } from './facets.ts';
import { FACETS, STREAMS } from './server/facets.ts';
import { order } from './server/nodes.ts';
import { Sources } from './server/sources.ts';
import { UTC } from './chart/series.ts';

/** Where Cloudflare places a reader in Osaka, whose order is Tokyo's three first. */
const OSAKA = { latitude: '34.6937', longitude: '135.5023' };

describe('the facets the browser asks', () => {
	it('are the facets and streams the server answers, every one', () => {
		expect([...NAMES].toSorted()).toEqual(
			[...Object.keys(FACETS), ...Object.keys(STREAMS)].toSorted(),
		);
	});

	it('name the nearest relay without asking one', async () => {
		const sources = new Sources({ env: {}, where: OSAKA });
		const answer = await FACETS.nearest.read({ sources, zone: UTC, now: 0 }, {});
		expect(answer).toEqual({ node: order(OSAKA)[0], order: order(OSAKA) });
	});
});

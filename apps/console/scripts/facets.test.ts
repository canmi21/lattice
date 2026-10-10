import { describe, expect, it } from 'vitest';
import { contracts, facetAddresses } from './facets.ts';

describe("the facets' addresses", () => {
	it('give every facet one, from its type', () => {
		const addresses = facetAddresses();
		const names = Object.keys(addresses);
		expect(names).toContain('timeline');
		for (const address of Object.values(addresses)) expect(address).toMatch(/^[0-9a-f]{12}$/);
		expect(new Set(Object.values(addresses)).size).toBe(names.length);
	});

	it('read every field and literal, not a name in place of a type', () => {
		const { timeline } = contracts();
		expect(timeline?.contract).toMatchObject({
			params: { by: { anyOf: ['{"literal":"app"}', '{"literal":"node"}'] } },
			answer: { at: 'number', rows: { array: { array: 'string' } } },
		});
		expect(JSON.stringify(contracts())).not.toContain('"any"');
	});
});

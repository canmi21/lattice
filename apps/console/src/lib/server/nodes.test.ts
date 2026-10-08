import { describe, expect, it } from 'vitest';
import { NODES, order } from './nodes';

const EVERY = Object.keys(NODES).toSorted();

describe('order', () => {
	it('puts the Tokyo nodes first for a reader in Osaka', () => {
		const nodes = order({ latitude: '34.6937', longitude: '135.5023' });
		expect(nodes.slice(0, 3).toSorted()).toEqual(['hnd', 'nrt', 'tyo']);
	});

	it('puts bru before gvx for a reader in Paris', () => {
		const nodes = order({ latitude: '48.8566', longitude: '2.3522' });
		expect(nodes.slice(0, 2)).toEqual(['bru', 'gvx']);
	});

	it('puts rdu before buf for a reader in Virginia', () => {
		const nodes = order({ latitude: '37.5407', longitude: '-77.4360' });
		expect(nodes.slice(0, 2)).toEqual(['rdu', 'buf']);
	});

	it('puts sha first for a reader in Hangzhou, then the Tokyo nodes', () => {
		const nodes = order({ latitude: '30.2741', longitude: '120.1551' });
		expect(nodes[0]).toBe('sha');
		expect(nodes.slice(1, 4).toSorted()).toEqual(['hnd', 'nrt', 'tyo']);
	});

	it('goes by the place over the continent when it has both', () => {
		const nodes = order({ latitude: '48.8566', longitude: '2.3522', continent: 'AS' });
		expect(nodes[0]).toBe('bru');
	});

	it('falls back to the continent when it has no place', () => {
		expect(order({ continent: 'AS' }).slice(0, 4)).toEqual(['tyo', 'nrt', 'hnd', 'sha']);
		expect(order({ continent: 'EU' }).slice(0, 2)).toEqual(['gvx', 'bru']);
		expect(order({ continent: 'NA', latitude: '' }).slice(0, 2)).toEqual(['buf', 'rdu']);
	});

	it('falls back to the fixed order with nothing to go by', () => {
		expect(order(undefined)).toEqual(Object.keys(NODES));
		expect(order({ continent: 'AN' })).toEqual(Object.keys(NODES));
	});

	it('names every node once, whatever the reader', () => {
		for (const where of [undefined, { continent: 'EU' }, { latitude: '0', longitude: '0' }]) {
			expect(order(where).toSorted()).toEqual(EVERY);
		}
	});
});

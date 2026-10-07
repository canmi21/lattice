import { describe, expect, it } from 'vitest';
import { gather, type Member, rank } from './places.ts';

const GIB = 2 ** 30;
const member = (code: string, overrides: Partial<Member> = {}): Member => ({
	code,
	role: 'relay',
	cluster: undefined,
	state: 'live',
	apps: { running: 7, total: 7 },
	memory: GIB,
	used: undefined,
	cpu: 1,
	heard: '2026-10-06T12:00:00Z',
	point: [100, 100],
	...overrides,
});

const tokyo = (overrides: Partial<Member> = {}) => ({ cluster: 'tokyo', ...overrides });

describe('the marks the nodes gather into', () => {
	it('draws the nodes of one place as one mark, and a node alone as its own', () => {
		const sites = gather([
			member('tyo', tokyo({ role: 'core', point: [100, 100] })),
			member('gvx', { role: 'core' }),
			member('nrt', tokyo({ point: [102, 100] })),
			member('hnd', tokyo({ point: [101, 103] })),
		]);
		expect(sites.map((site) => site.key)).toEqual(['tokyo', 'gvx']);
		expect(sites[0]?.members.map((one) => one.code)).toEqual(['tyo', 'nrt', 'hnd']);
		expect(sites[0]?.point).toEqual([101, 101]);
		expect(sites[1]?.members.map((one) => one.code)).toEqual(['gvx']);
	});

	it('sums memory and apps running over what it knows, and takes the busiest CPU', () => {
		const [site] = gather([
			member('tyo', tokyo({ memory: 23 * GIB, apps: { running: 9, total: 9 }, cpu: 1.8 })),
			member('nrt', tokyo({ memory: GIB, apps: { running: 6, total: 7 }, cpu: 3.9 })),
			member('hnd', tokyo({ memory: undefined, apps: undefined, cpu: undefined })),
		]);
		expect(site?.memory).toBe(24 * GIB);
		expect(site?.apps).toBe(15);
		expect(site?.cpu).toBe(3.9);
	});

	it('knows nothing of a place none of whose nodes says', () => {
		const [site] = gather([
			member('tyo', tokyo({ memory: undefined, apps: undefined, cpu: undefined })),
		]);
		expect([site?.memory, site?.apps, site?.cpu]).toEqual([undefined, undefined, undefined]);
	});

	it('is gone if any of its nodes is gone', () => {
		const [live] = gather([member('tyo', tokyo()), member('nrt', tokyo())]);
		const [gone] = gather([member('tyo', tokyo()), member('nrt', tokyo({ state: 'gone' }))]);
		expect(live?.state).toBe('live');
		expect(gone?.state).toBe('gone');
	});
});

describe('who leads a place', () => {
	it('is a core node before a relay running more', () => {
		const ranked = rank([
			member('nrt', { apps: { running: 30, total: 30 } }),
			member('tyo', { role: 'core', apps: { running: 2, total: 2 } }),
		]);
		expect(ranked.map((one) => one.code)).toEqual(['tyo', 'nrt']);
	});

	it('is the one running more within a role, then the first in node order', () => {
		const ranked = rank([
			member('a', { apps: { running: 3, total: 3 } }),
			member('b', { apps: { running: 9, total: 9 } }),
			member('c', { apps: { running: 3, total: 3 } }),
			member('d', { apps: undefined }),
		]);
		expect(ranked.map((one) => one.code)).toEqual(['b', 'a', 'c', 'd']);
	});
});

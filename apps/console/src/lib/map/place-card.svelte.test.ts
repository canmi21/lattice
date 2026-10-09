import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PlaceCard from './place-card.svelte';
import type { Member, Site } from './places.ts';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const GIB = 2 ** 30;
const member = (code: string, overrides: Partial<Member> = {}): Member => ({
	code,
	role: 'relay',
	cluster: 'tokyo',
	state: 'live',
	apps: { running: 7, total: 7 },
	memory: GIB,
	used: GIB / 2,
	cpu: 1.5,
	heard: '2026-10-06T11:59:58Z',
	point: [0, 0],
	...overrides,
});
const site = (members: Member[], overrides: Partial<Site> = {}): Site => ({
	key: members.length > 1 ? 'tokyo' : (members[0]?.code ?? ''),
	members,
	point: [0, 0],
	memory: undefined,
	apps: undefined,
	cpu: undefined,
	state: 'live',
	...overrides,
});

describe('a place card on the server', () => {
	it('names a shared place, sums it, and links a row for every node', () => {
		const members = [
			member('tyo', { role: 'core', apps: { running: 9, total: 9 }, cpu: 1.8 }),
			member('nrt', { cpu: 3.96 }),
			member('hnd', { state: 'gone', cpu: undefined }),
		];
		const { body } = render(PlaceCard, {
			props: { site: site(members, { memory: 25.4 * GIB, apps: 21, state: 'gone' }), now: NOW },
		});
		expect(body).toContain('>Tokyo, Japan<');
		expect(body).toContain('3 nodes, 25.4 GiB, 21 apps');
		for (const code of ['tyo', 'nrt', 'hnd']) {
			expect(body).toMatch(new RegExp(`href="/nodes/${code}"[^>]*data-row="${code}"`));
		}
		expect(body).toMatch(/data-row="tyo"[^]*?1.8%[^]*?9 apps/);
		expect(body).toMatch(/data-row="hnd"[^]*?–/);
		expect(body).not.toContain('Role');
	});

	it('keeps the figures of a node alone', () => {
		const lone = member('gvx', { cluster: undefined, role: 'core' });
		const { body } = render(PlaceCard, { props: { site: site([lone]), now: NOW } });
		expect(body).toContain('Sweden, European Union<');
		expect(body).toContain('>gvx<');
		expect(body).toContain('>Gävle<');
		for (const label of ['Status', 'Heard', 'Role', 'Apps running', 'CPU now', 'Memory used']) {
			expect(body).toContain(`>${label}<`);
		}
		expect(body).toContain('1.0 GiB');
		expect(body).toContain('50%');
		expect(body).not.toContain('data-row');
	});
});

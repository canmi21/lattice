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
	it('reads a shared place across: rows named at the left, a close column a city', () => {
		const members = [
			member('tyo', { role: 'core', apps: { running: 9, total: 9 }, cpu: 1.8 }),
			member('nrt', { cpu: 3.96, booted: NOW / 1000 - 3 * 86_400 }),
			member('hnd', { state: 'gone', cpu: undefined }),
		];
		const { body } = render(PlaceCard, {
			props: { site: site(members, { memory: 25.4 * GIB, apps: 21, state: 'gone' }), now: NOW },
		});
		// The country in the corner, over the rows' names; no title above the table.
		expect(body).toMatch(/<th scope="col"[^>]*>Japan<\/th>/);
		expect(body).not.toContain('Tokyo, Japan<');
		for (const code of ['tyo', 'nrt', 'hnd']) {
			expect(body).toMatch(new RegExp(`href="/nodes/${code}"[^>]*data-row="${code}"`));
		}
		for (const part of ['Tokyo', 'Narita', 'Haneda']) expect(body).toContain(`>${part}</a>`);
		for (const row of ['Uptime', 'Role', 'Apps', 'CPU', 'RAM', 'Latency']) {
			expect(body.match(new RegExp(`>${row}</th>`, 'g'))).toHaveLength(1);
		}
		expect(body).toContain('3d 0h');
		expect(body).toContain('Not heard');
		expect(body).toContain('9 of 9');
		expect(body).toContain('0.5G');
		// The code is the key, never the name; it is said only to assistive technology.
		expect(body).not.toMatch(/>(tyo|nrt|hnd)</);
	});

	it('lists a node alone by uptime, role, apps and two rings, with no state or clock', () => {
		const lone = member('gvx', { cluster: undefined, role: 'core' });
		const { body } = render(PlaceCard, { props: { site: site([lone]), now: NOW } });
		expect(body).toContain('Sweden, European Union');
		// The name is the country's and the union's; the card adds no city to it.
		expect(body).not.toContain('Gävle');
		for (const row of ['Uptime', 'Role', 'Apps', 'CPU', 'RAM', 'Latency']) {
			expect(body).toContain(`>${row}</dt>`);
		}
		expect(body).toContain('1.5%');
		expect(body).toContain('0.5G');
		for (const gone of ['Status', 'Heard', 'CPU now', 'Memory used', '>gvx<']) {
			expect(body).not.toContain(gone);
		}
		expect(body).not.toContain('data-row');
	});
});

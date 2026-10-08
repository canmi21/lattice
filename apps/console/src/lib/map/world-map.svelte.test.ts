import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { DOTS } from './land.generated.ts';
import WorldMap from './world-map.svelte';
import type { Held } from '../wire.ts';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const PLACES = ['tokyo', 'gvx', 'buf', 'bru', 'rdu', 'sha'];

function held(secondsAgo: number, cpu?: number, gib?: number): Held {
	return {
		version: 1,
		heard_at: new Date(NOW - secondsAgo * 1000).toISOString(),
		snapshot: {
			taken_at: '2026-10-06T12:00:00Z',
			events: [],
			apps: [{ name: 'geo', image: 'geo:1', deployed_at: '', running: true, held: false }],
			machine:
				cpu === undefined && gib === undefined
					? undefined
					: {
							info: gib === undefined ? {} : { memory: gib * 2 ** 30 },
							sample: {
								values: {
									...(cpu === undefined ? {} : { 'cpu.usage': cpu }),
									'memory.used': 2 ** 29,
								},
							},
						},
		},
	};
}

/** Each place's mark, from its link to the link's end. */
const marks = (body: string) =>
	Object.fromEntries(
		body
			.split('data-place="')
			.slice(1)
			.map((mark) => [mark.slice(0, mark.indexOf('"')), mark.split('</a>')[0] ?? '']),
	);

describe('world map on the server', () => {
	const states = {
		tyo: held(2, 1, 1),
		nrt: held(2, 15, 1.5),
		hnd: held(2, undefined, 6),
		gvx: held(30, undefined, 1),
		buf: held(300, undefined, 3),
	};

	it('draws the land as dots and one mark per place, with no name and no line', () => {
		const { body } = render(WorldMap, { props: { states, now: NOW } });
		expect(body).toMatch(/<svg[^>]*viewBox="0 0 1000 670"/);
		expect(body).toContain(`d="${DOTS}"`);
		expect(body).toContain('stroke-dasharray="4 6"');
		expect(Object.keys(marks(body))).toEqual(PLACES);
		expect(body.match(/<path/g)).toHaveLength(1);
		expect(body).not.toContain('<line');
		expect(body).not.toMatch(/>(tyo|gvx|Tokyo)<\/span>/);
	});

	it("merges Tokyo's three into one mark that opens the node leading it", () => {
		const { body } = render(WorldMap, { props: { states, now: NOW } });
		const tokyo = marks(body).tokyo ?? '';
		expect(body).toContain('href="/nodes/tyo" data-place="tokyo"');
		expect(tokyo).toContain('aria-label="Tokyo, Japan, 3 nodes, live"');
		expect(body).not.toContain('data-node="nrt"');
		expect(body).not.toContain('data-node="hnd"');
	});

	it('shows two states, a late node heard, a place gone if any of its nodes is', () => {
		const by = marks(render(WorldMap, { props: { states, now: NOW } }).body);
		expect(by.tokyo).toContain('data-state="live"');
		expect(by.gvx).toContain('data-state="live"');
		expect(by.buf).toContain('data-state="gone"');
		expect(by.rdu).toContain('data-state="gone"');
		const { hnd: _, ...without } = states;
		const missing = marks(render(WorldMap, { props: { states: without, now: NOW } }).body);
		expect(missing.tokyo).toContain('data-state="gone"');
		expect(missing.tokyo).not.toContain('data-halo');
	});

	it('sizes each mark by the memory at its place, the middle size where it is not known', () => {
		const by = marks(render(WorldMap, { props: { states, now: NOW } }).body);
		// Tokyo: 1 + 1.5 + 6 GiB, past 8.
		expect(by.tokyo).toContain('data-radius="12"');
		expect(by.gvx).toContain('data-radius="7"');
		expect(by.gvx).toContain('width: 1.4cqw');
		expect(by.buf).toContain('data-radius="9.5"');
		expect(by.rdu).toContain('data-radius="9.5"');
	});

	it('fills every mark as deep as its place runs, a gone one too', () => {
		const by = marks(render(WorldMap, { props: { states, now: NOW, compact: true } }).body);
		expect(by.tokyo).toContain('style="opacity: 0.45;"');
		expect(by.buf).toContain('style="opacity: 0.45;"');
		expect(by.rdu).toContain('style="opacity: 0.72;"');
	});

	it('breathes a halo behind each heard mark, as fast as its busiest node', () => {
		const by = marks(render(WorldMap, { props: { states, now: NOW } }).body);
		expect(by.tokyo).toMatch(/data-halo[^>]*animation-duration: 1.6s/);
		expect(by.gvx).toMatch(/data-halo[^>]*animation-duration: 4s/);
		expect(by.buf).not.toContain('data-halo');
		expect(by.rdu).not.toContain('data-halo');
		const delays = Object.values(by).map((mark) => /animation-delay: ([^;"]+)/.exec(mark)?.[1]);
		expect(new Set(delays.filter(Boolean)).size).toBe(2);
	});

	it('raises the place of the selected node, and draws no links', () => {
		const by = marks(render(WorldMap, { props: { states, now: NOW, selected: 'nrt' } }).body);
		expect(by.tokyo).toContain('z-index: 10');
		expect(by.gvx).not.toContain('z-index');
	});

	it('starts flat, the globe offered and not drawn', () => {
		const { body } = render(WorldMap, { props: { states, now: NOW } });
		expect(body).toContain('aria-label="Map view"');
		expect(body).toMatch(/aria-checked="true"[^>]*>Flat</);
		expect(body).toMatch(/aria-checked="false"[^>]*>Globe</);
		expect(body).not.toContain('<canvas');
		expect(body).not.toContain('The nodes on a globe');
	});

	it('leaves the card and globe out of a compact map', () => {
		const { body } = render(WorldMap, { props: { states, now: NOW, compact: true } });
		expect(Object.keys(marks(body))).toEqual(PLACES);
		expect(body).not.toContain('role="tooltip"');
		expect(body).not.toContain('Map view');
	});
});

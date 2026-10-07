import { describe, expect, it } from 'vitest';
import type { FleetEvent } from '#lib/server/fleet.ts';
import { choices, matches, pageOf, parseQuery, search } from './query.ts';

const NODES = ['tyo', 'gvx'];
const event = (
	node: string,
	id: number,
	at: string,
	rest: Partial<FleetEvent> = {},
): FleetEvent => ({
	node: node as FleetEvent['node'],
	id,
	app: 'web',
	action: 'deploy',
	source: { kind: 'run', run: 1 },
	outcome: 'succeeded',
	started_at: at,
	...rest,
});
const parse = (text: string) => parseQuery(new URLSearchParams(text), NODES);

describe('query', () => {
	it('reads the filters, the size and the cursor, and drops what it does not know', () => {
		expect(parse('node=tyo&outcome=failed&q=%20boom%20&size=100&before=tyo:5,xxx:3,gvx:z')).toEqual(
			{
				node: 'tyo',
				app: '',
				action: '',
				outcome: 'failed',
				stage: '',
				q: 'boom',
				size: 100,
				before: { tyo: 5 },
			},
		);
		expect(parse('node=nowhere&size=7')).toMatchObject({ node: '', size: 50, before: {} });
	});

	it('writes back what it read, leaving out the defaults', () => {
		expect(search(parse(''))).toBe('');
		const text = '?node=tyo&q=boom&size=25&before=tyo%3A5%2Cgvx%3A9';
		expect(search(parse(text))).toBe(text);
		expect(search(parse(text), {})).toBe('?node=tyo&q=boom&size=25');
	});

	it('filters by every field and searches the detail', () => {
		const failed = event('tyo', 1, '2026-10-06T01:00:00Z', {
			outcome: 'failed',
			detail: 'Disk FULL',
		});
		expect(matches(failed, parse('outcome=failed&q=disk'))).toBe(true);
		expect(matches(failed, parse('outcome=failed&node=gvx'))).toBe(false);
		expect(matches(failed, parse('stage=loading'))).toBe(false);
		expect(matches(failed, parse('q=nothing'))).toBe(false);
	});

	it('pages newest first and hands back a cursor per node', () => {
		const pool = [
			event('tyo', 1, '2026-10-06T01:00:00Z'),
			event('gvx', 7, '2026-10-06T03:00:00Z'),
			event('tyo', 2, '2026-10-06T02:00:00Z'),
			event('tyo', 3, '2026-10-06T00:00:00Z', { outcome: 'failed' }),
		];
		const page = pageOf(pool, parse('size=25'), NODES);
		expect(page.events.map(({ id }) => id)).toEqual([7, 2, 1, 3]);
		const small = pageOf(pool, { ...parse(''), size: 2 }, NODES);
		expect(small.events.map(({ id }) => id)).toEqual([7, 2]);
		expect(small.next).toEqual({ gvx: 7, tyo: 2 });
		expect(small.more).toBe(true);
		const only = pageOf(pool, parse('outcome=failed'), NODES);
		expect(only.events).toHaveLength(1);
		expect(only.more).toBe(false);
	});

	it('lists the values seen, and the selected one even when unseen', () => {
		const pool = [event('tyo', 1, '2026-10-06T01:00:00Z', { stage: 'loading' })];
		expect(choices(pool, 'stage', 'starting')).toEqual(['loading', 'starting']);
		expect(choices(pool, 'app', '')).toEqual(['web']);
	});
});

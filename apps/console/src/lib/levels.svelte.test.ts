import { describe, expect, it } from 'vitest';
import { levelOf, titleOf } from './levels.ts';

const at = (href: string) => new URL(href, 'http://localhost');

describe('levelOf', () => {
	it('lists the view’s sections at its root, with no way up', () => {
		const level = levelOf({ url: at('/infra/nodes'), view: 'infra' });
		expect(level.items.map((one) => one.label)).toEqual([
			'Overview',
			'Nodes',
			'Deployments',
			'Apps',
			'Events',
		]);
		expect(level.current).toBe('/nodes');
		expect(level.up).toBeUndefined();
		expect(level.trail).toEqual([{ label: 'Nodes' }]);
	});

	it('leaves Nodes out of a view that does not show them', () => {
		const level = levelOf({ url: at('/services'), view: 'services' });
		expect(level.items.map((one) => one.key)).not.toContain('/nodes');
	});

	it('enters a node: its pages, the way back to Nodes, and its tab in the trail', () => {
		const level = levelOf({
			url: at('/infra/nodes/tyo?tab=disk&range=6h'),
			view: 'infra',
			node: 'tyo',
		});
		expect(level.items.map((one) => one.key)).toEqual(['overview', 'apps', 'events', 'disk']);
		expect(level.current).toBe('disk');
		expect(level.up).toEqual({ label: 'Nodes', href: '/infra/nodes' });
		expect(level.items[1]?.href).toBe('/infra/nodes/tyo?tab=apps&range=6h');
		expect(level.trail.map((one) => one.label)).toEqual(['Nodes', 'Tokyo, Japan', 'Disk']);
		expect(level.trail.at(-1)?.href).toBeUndefined();
	});

	it('enters an app, keeping its span across its pages', () => {
		const level = levelOf({
			url: at('/platform/apps/relay?range=7d'),
			view: 'platform',
			app: 'relay',
		});
		expect(level.current).toBe('overview');
		expect(level.items.map((one) => one.href)).toEqual([
			'/platform/apps/relay?range=7d',
			'/platform/apps/relay?tab=usage&range=7d',
			'/platform/apps/relay?tab=history&range=7d',
		]);
		expect(level.trail).toEqual([
			{ label: 'Apps', href: '/platform/apps' },
			{ label: 'Relay', code: 'relay' },
		]);
	});

	it('keeps a run in the level it was opened from', () => {
		const where = { url: at('/deployments/42'), view: 'all' as const, run: '42' };
		const level = levelOf(where);
		expect(level.up).toBeUndefined();
		expect(level.current).toBe('/deployments');
		expect(level.trail).toEqual([
			{ label: 'Deployments', href: '/deployments' },
			{ label: '#42', mono: true },
		]);
		expect(titleOf(level, where)).toBe('#42');
	});
});

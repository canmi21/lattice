import { describe, expect, it, vi } from 'vitest';
import { bound, paths, success } from './bound.ts';
import { app, appHealth, appSeries, apps, disk, events, history } from './reads.ts';
import { nodeNow, nodeSeries, range } from './reads.ts';

const NOW = 1_000_000;

describe('range', () => {
	it('draws one hour from minutes and everything longer from hours', () => {
		expect(range('1h', NOW)).toEqual({ grain: 'minute', since: NOW - 3600, until: NOW });
		expect(range('6h', NOW)).toEqual({ grain: 'hour', since: NOW - 6 * 3600, until: NOW });
		expect(range('24h', NOW).since).toBe(NOW - 86_400);
		expect(range('7d', NOW)).toMatchObject({ grain: 'hour', since: NOW - 7 * 86_400 });
		expect(range('30d', NOW)).toMatchObject({ grain: 'hour', since: NOW - 30 * 86_400 });
	});
});

describe('one node', () => {
	it('asks host for each path and query, and hands back the data', async () => {
		const { sent, env } = bound({ tyo: () => success([]) });
		const edge = { env };
		const span = { grain: 'hour', since: 10, until: 20 } as const;
		await nodeNow(edge, 'tyo');
		await nodeSeries(edge, 'tyo', { ...span, metrics: ['cpu.usage', 'load.1'] });
		await nodeSeries(edge, 'tyo', span);
		await apps(edge, 'tyo');
		await app(edge, 'tyo', 'web');
		await appHealth(edge, 'tyo', 'database');
		await appSeries(edge, 'tyo', 'web', span);
		await history(edge, 'tyo', 'web', { before: 9, limit: 5 });
		await history(edge, 'tyo', 'web');
		await events(edge, 'tyo', { limit: 20 });
		await events(edge, 'tyo');
		await disk(edge, 'tyo');
		expect(paths(sent)).toEqual([
			'/node/now',
			'/node/series?grain=hour&metrics=cpu.usage%2Cload.1&since=10&until=20',
			'/node/series?grain=hour&since=10&until=20',
			'/apps',
			'/apps/web',
			'/apps/database/health',
			'/apps/web/metrics/series?grain=hour&since=10&until=20',
			'/apps/web/history?before=9&limit=5',
			'/apps/web/history',
			'/events?limit=20',
			'/events',
			'/inspect/disk',
		]);
	});

	it('keeps an app name to one path segment', async () => {
		const { sent, env } = bound({ tyo: () => success(null) });
		await app({ env }, 'tyo', '../node/now');
		expect(paths(sent)).toEqual(['/apps/..%2Fnode%2Fnow']);
	});

	it('gives up on a node that does not answer in time', async () => {
		const env = {
			HOST_READ_TOKEN: 't',
			TYO: {
				fetch: (_url: string, init: RequestInit) =>
					new Promise((_, reject) => {
						init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
					}),
			},
		} as never;
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.useFakeTimers();
		const pending = nodeNow({ env }, 'tyo');
		await vi.advanceTimersByTimeAsync(4001);
		expect(await pending).toMatchObject({ ok: false, failure: { status: 502 } });
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
});

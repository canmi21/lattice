import { describe, expect, it } from 'vitest';
import app from './index';

/**
 * This worker refuses in the envelope too, including when nothing of ours refused.
 *
 * A success here is the object's own bytes and is not wrapped -- an image is an image. Everything
 * else takes the shape the API takes, so a caller reads one thing whichever worker said no. The
 * gap was hono's own 404: `text/plain`, which a caller parsing JSON reads as a syntax error.
 */
describe('a refusal nothing handled', () => {
	// A single segment that is not one of the names this host mounts cannot be an address here at
	// all, so it is malformed rather than missing -- and that is decided before any route runs.
	it('refuses an address this host cannot express, and holds it briefly at most', async () => {
		const res = await app.fetch(
			new Request('https://cdn.example/anything', { method: 'POST' }),
			{} as never,
		);
		expect(res.status).toBe(400);
		expect(res.headers.get('Content-Type')).toContain('application/json');
		expect(await res.json()).toEqual({ status: 'error', message: 'not_an_address' });
		// The lifetime is the cache middleware's, derived from the response rather than restated.
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
	});

	it('wraps a method a known address cannot answer', async () => {
		const res = await app.fetch(
			new Request('https://cdn.example/robots.txt', { method: 'POST' }),
			{} as never,
		);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ status: 'error', message: 'no_such_route' });
	});
});

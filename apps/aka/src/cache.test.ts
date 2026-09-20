import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { cacheControl, NEVER, REFUSED, RESOLVED } from './cache';

/**
 * The split this layer keeps is between a fact about the corpus and a fact about this moment.
 *
 * Held as a test because getting it wrong is invisible: an upstream blip cached for five minutes
 * is an outage for every icon on the page, and nothing about the response would say so.
 */
function app() {
	const hono = new Hono();
	hono.use('*', cacheControl);
	hono.get('/resolved', (c) => {
		const answer = c.redirect('https://cdn.example/image/a.ico', 302);
		answer.headers.set('Cache-Control', RESOLVED);
		return answer;
	});
	hono.get('/upstream', (c) => {
		const answer = c.json({ status: 'error' }, 502);
		answer.headers.set('Cache-Control', NEVER);
		return answer;
	});
	hono.get('/unstamped', (c) => c.text('something a later route added'));
	return hono;
}

describe('what this layer lets a cache keep', () => {
	it('gives a resolved redirect the life of the answer behind it', async () => {
		const response = await app().request('/resolved');
		// Five minutes, because that is what the API's own answer takes. A different number here
		// would be a second publication delay on one resource.
		expect(response.headers.get('Cache-Control')).toBe(RESOLVED);
		expect(RESOLVED).toContain('max-age=300');
		expect(RESOLVED).toContain('stale-if-error=');
	});

	it('never stores an upstream failure', async () => {
		const response = await app().request('/upstream');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
	});

	it('stamps the corpus lifetime on a route that named none', async () => {
		// The floor matters more than the value: a route added later must not be able to answer
		// with no lifetime at all, which is what leaves the decision to a heuristic downstream.
		const response = await app().request('/unstamped');
		expect(response.headers.get('Cache-Control')).toBe(REFUSED);
	});
});

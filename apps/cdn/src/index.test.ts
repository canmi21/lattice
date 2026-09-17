import { robotsTxt } from '@canmi/robots';
import { describe, expect, it } from 'vitest';
import app from './index';
import { candidates, isValidHostname } from './favicon';

describe('isValidHostname', () => {
	it('accepts an ordinary hostname', () => {
		expect(isValidHostname('example.com')).toBe(true);
		expect(isValidHostname('blog.example.co.uk')).toBe(true);
	});

	it('rejects things that are not public sites', () => {
		// A worker resolving `localhost` would reach itself, and a bare address is not a site.
		expect(isValidHostname('localhost')).toBe(false);
		expect(isValidHostname('127.0.0.1')).toBe(false);
		expect(isValidHostname('nodots')).toBe(false);
	});

	it('keeps a hostname that merely starts with a digit', () => {
		expect(isValidHostname('1.example.com')).toBe(true);
	});

	it('rejects malformed labels', () => {
		expect(isValidHostname('-lead.example.com')).toBe(false);
		expect(isValidHostname('trail-.example.com')).toBe(false);
		expect(isValidHostname('a..example.com')).toBe(false);
		expect(isValidHostname('bad_underscore.com')).toBe(false);
	});
});

describe('candidates', () => {
	it('honours a named tone exactly, with no substitute', () => {
		// Returning the other shade would be invisible to the caller, which would then draw a
		// light icon on a dark surface believing it had asked for and received the right one.
		expect(candidates('dark')).toEqual(['dark']);
		expect(candidates('light')).toEqual(['light']);
	});

	it('accepts either variant when no tone is named', () => {
		expect(candidates(undefined)).toEqual(['light', 'dark']);
	});

	it('treats an unrecognised tone as no tone', () => {
		expect(candidates('sepia')).toEqual(['light', 'dark']);
	});
});

describe('robots policy', () => {
	// This was written once and silently lost to a bad patch, and nothing noticed until a card
	// failed to appear. What a crawler may fetch is worth an assertion rather than a reading.
	const text = robotsTxt({ disallow: [''] });

	it('forbids nothing', () => {
		// An empty Disallow is the format's way of saying "all of it", and it is the only way
		// every crawler agrees on: Twitterbot implements the 1994 draft, which has no `Allow`,
		// so an exception carved out of `Disallow: /` is invisible to exactly the client that
		// most needs it.
		expect(text).toContain('Disallow:');
		expect(text).not.toContain('Disallow: /');
	});

	it('still answers, rather than 404ing and leaving it open to interpretation', () => {
		expect(text).toContain('User-agent: *');
	});
});

/**
 * This worker refuses in the envelope too, including when nothing of ours refused.
 *
 * A success here is the object's own bytes and is not wrapped -- an image is an image. Everything
 * else takes the shape the API takes, so a caller reads one thing whichever worker said no. The
 * gap was hono's own 404: `text/plain`, which a caller parsing JSON reads as a syntax error.
 */
describe('a refusal nothing handled', () => {
	it('wraps a method the bucket cannot answer, and holds it briefly at most', async () => {
		const res = await app.fetch(
			new Request('https://cdn.example/anything', { method: 'POST' }),
			{} as never,
		);
		expect(res.status).toBe(404);
		expect(res.headers.get('Content-Type')).toContain('application/json');
		expect(await res.json()).toEqual({ status: 'error', message: 'no_such_route' });
		// The lifetime is the cache middleware's, derived from the response rather than restated.
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
	});
});

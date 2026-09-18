import { ARTIFACT_TYPES, artifactKey } from '@canmi/artifacts';
import { storageKey } from '@canmi/store';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { cacheControl, isContentAddressed } from './cache';

const HASH = '44b6081deaf0242ca3bf83d62a3b6c95';
const YEAR = 'public, max-age=31536000, immutable';
const MINUTES = 'public, max-age=300';

/** The two font shapes, as the bucket spells them: one promised by name, one hashed. */
const LATIN = '/fonts/ioskeley-mono/IoskeleyMono-Regular-latin.woff2';
const CJK = `/fonts/lxgw-wenkai/${HASH}.woff2`;

/** A request path, from a bucket key. The two differ by a leading slash and nothing else. */
function path(key: string): string {
	return `/${key}`;
}

describe('isContentAddressed', () => {
	// The point of the predicate: every artifact type answers yes without being named here, so
	// adding one to @canmi/artifacts carries no cache decision with it.
	it('recognises every artifact type', () => {
		for (const type of ARTIFACT_TYPES) {
			expect(isContentAddressed(path(artifactKey(type, HASH)))).toBe(true);
		}
	});

	// The same predicate, the other shape. A variant is content-addressed today and the year it
	// already has must survive the policy being derived rather than decided per route.
	it('recognises the assets this worker already served', () => {
		expect(isContentAddressed(`/image/${HASH}.avif`)).toBe(true);
		expect(isContentAddressed(`/image/${HASH}.webp`)).toBe(true);
		expect(isContentAddressed(`/captions/${HASH}.vtt`)).toBe(true);
		expect(isContentAddressed(`/video/${HASH}.mp4`)).toBe(true);
		expect(isContentAddressed(`/license/${HASH}.txt`)).toBe(true);
		// A CJK chunk is named by its hash and needs no promise; only the Latin subsets do.
		expect(isContentAddressed(CJK)).toBe(true);
	});

	// A request names the id alone; the bucket fans it out. Both spellings end in the hash, which
	// is why one predicate covers the path and the key it resolves to.
	it('recognises the fanned-out key as well as the path that asks for it', () => {
		expect(isContentAddressed(path(storageKey(HASH, 'avif')))).toBe(true);
	});

	it('does not recognise the enumerated exceptions', () => {
		// A Latin subset is a promise, not an observation, and is kept by name rather than shape.
		expect(isContentAddressed(LATIN)).toBe(false);
		expect(isContentAddressed('/favicon/example.com')).toBe(false);
	});

	it('does not recognise a name that merely sits beside hashed ones', () => {
		expect(isContentAddressed('/license/full.txt')).toBe(false);
		expect(isContentAddressed('/opengraph/development/thing.png')).toBe(false);
		expect(isContentAddressed('/robots.txt')).toBe(false);
	});

	it('holds the hash to its exact spelling', () => {
		expect(isContentAddressed(`/image/${HASH.slice(1)}.avif`)).toBe(false);
		expect(isContentAddressed(`/image/${HASH}f.avif`)).toBe(false);
		expect(isContentAddressed(`/image/${HASH.toUpperCase()}.avif`)).toBe(false);
		expect(isContentAddressed(`/image/${HASH}`)).toBe(false);
	});
});

describe('cacheControl', () => {
	const app = new Hono();
	app.use('*', cacheControl);
	for (const type of ARTIFACT_TYPES) {
		app.get(path(artifactKey(type, HASH)), (c) => c.text('object'));
	}
	app.get('/content/missing.json', (c) => c.json({ error: 'x' }, 404));
	app.get(`/image/${HASH}.avif`, (c) => c.text('bytes'));
	app.get(`/image/${HASH}.gone`, (c) => c.json({ error: 'x' }, 404));
	app.get(LATIN, (c) => c.text('font'));
	app.get(CJK, (c) => c.text('chunk'));
	app.get('/favicon/example.com', (c) => c.text('icon'));
	app.get('/license/full.txt', (c) => c.text('aggregate'));
	app.get('/missing', (c) => c.json({ error: 'not found' }, 404));
	app.get(`/video/${HASH}.mp4`, (c) => c.body(null, 304));
	app.get('/favicon/stale.com', (c) => c.body(null, 304));
	app.get('/preset', (c) => {
		c.header('Cache-Control', 'no-store');
		return c.text('special');
	});

	async function policy(url: string): Promise<string | null> {
		return (await app.request(url)).headers.get('Cache-Control');
	}

	it('keeps every content-addressed answer for a year', async () => {
		// The year rests on the name being a hash, not on a promise anyone has to remember.
		for (const type of ARTIFACT_TYPES) {
			expect(await policy(path(artifactKey(type, HASH)))).toBe(YEAR);
		}
		expect(await policy(`/image/${HASH}.avif`)).toBe(YEAR);
	});

	it('will not keep an error for a year, hashed or not', async () => {
		// An error is a statement about right now: a 404 on a hashed name means the object was
		// not uploaded or has been swept, and the key becomes valid a second later.
		expect(await policy(`/image/${HASH}.gone`)).toBe(MINUTES);
		expect(await policy('/content/missing.json')).toBe(MINUTES);
		expect(await policy('/missing')).toBe(MINUTES);
	});

	it('keeps a revalidated object for a year, because a 304 is not an error', async () => {
		// A 304's headers replace the stored response's, so five minutes here would cut a
		// year-old copy down to five on every revalidation -- the opposite of what it means.
		expect(await policy(`/video/${HASH}.mp4`)).toBe(YEAR);
		// And a name without a hash is still five minutes when it revalidates.
		expect(await policy('/favicon/stale.com')).toBe(MINUTES);
	});

	it('does not demote the fonts the promise covers', async () => {
		// The likeliest way to get this wrong: a Latin subset carries no hash, so a classifier
		// reading shapes alone drops it to five minutes and re-fetches the font on every visit.
		expect(await policy(LATIN)).toBe(YEAR);
		expect(await policy(CJK)).toBe(YEAR);
	});

	it('gives everything else five minutes', async () => {
		// A favicon is refetched and may legitimately change; the licence aggregate is rewritten
		// whenever the dependency tree moves. Neither name promises anything about its bytes.
		expect(await policy('/favicon/example.com')).toBe(MINUTES);
		expect(await policy('/license/full.txt')).toBe(MINUTES);
	});

	it('never overrides a header a route set deliberately', async () => {
		expect(await policy('/preset')).toBe('no-store');
	});
});

import { storageKey } from '@canmi/store';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { cacheControl, isContentAddressed, lifetimeFor } from './cache';

const HASH = '44b6081deaf0242ca3bf83d62a3b6c95';

/**
 * The three lifetimes, written out rather than imported.
 *
 * Every expectation here is a literal, because this file exists to catch one of them changing
 * and a test that composed its expectation the way the source does would agree with whatever
 * the source became.
 */
const YEAR = 'public, max-age=31536000, immutable';
const HOUR = 'public, max-age=3600';
const MINUTES = 'public, max-age=300';

/** One address out of each of the four groups, which is what the rule has to cover. */
const OBJECT = `/object/${HASH}.avif`;
const DERIVED = `/derive/${HASH}.avif.webp`;
const PROXIED = '/proxy/github/release/rdm/latest/rdm.dmg';
const SYMLINK = '/symlink/favicon.svg';

describe('isContentAddressed', () => {
	it('recognises both shapes a hashed address is written in', () => {
		expect(isContentAddressed(OBJECT)).toBe(true);
		// Two extensions and still nothing open: the hash names the source and the pair names
		// the conversion, so the answer is a function of the address either way.
		expect(isContentAddressed(DERIVED)).toBe(true);
		expect(isContentAddressed(`/derive/${HASH}.avif.zip`)).toBe(true);
	});

	// A request names the id alone; the bucket fans it out. Both spellings end in the hash, which
	// is why one predicate covers the path and the key it resolves to.
	it('recognises the fanned-out key as well as the path that asks for it', () => {
		expect(isContentAddressed(`/${storageKey(HASH, 'avif')}`)).toBe(true);
	});

	it('does not recognise a name, which is what the other two groups are', () => {
		expect(isContentAddressed(SYMLINK)).toBe(false);
		expect(isContentAddressed(PROXIED)).toBe(false);
		expect(isContentAddressed('/robots.txt')).toBe(false);
		expect(isContentAddressed('/favicon.ico')).toBe(false);
	});

	it('holds the hash to its exact spelling', () => {
		expect(isContentAddressed(`/object/${HASH.slice(1)}.avif`)).toBe(false);
		expect(isContentAddressed(`/object/${HASH}f.avif`)).toBe(false);
		expect(isContentAddressed(`/object/${HASH.toUpperCase()}.avif`)).toBe(false);
		expect(isContentAddressed(`/object/${HASH}`)).toBe(false);
	});
});

/**
 * The rule itself, over the four groups at once, which is the point of it being one rule.
 *
 * Two questions -- was it answered, and does the address carry a hash -- and the same three
 * answers wherever they are asked. A group is not a row in a table here, which is what stops a
 * fifth one from arriving with a lifetime nobody chose.
 */
describe('lifetimeFor', () => {
	it('keeps a settled answer to a hashed address for a year', () => {
		for (const status of [200, 206, 301, 304]) {
			expect(lifetimeFor(OBJECT, status)).toBe(YEAR);
			expect(lifetimeFor(DERIVED, status)).toBe(YEAR);
		}
	});

	it('keeps a settled answer to a name for an hour', () => {
		// The name is permanent and what stands behind it is not, so the hour is about the
		// target moving rather than about this answer being uncertain.
		expect(lifetimeFor(SYMLINK, 302)).toBe(HOUR);
		expect(lifetimeFor(PROXIED, 200)).toBe(HOUR);
		expect(lifetimeFor(PROXIED, 206)).toBe(HOUR);
		expect(lifetimeFor('/', 301)).toBe(HOUR);
	});

	it('will not keep a failure, hashed or not', () => {
		// A 404 on a hashed address means the object was not uploaded or has been swept, and the
		// key becomes valid a second later. A year of that would outlive the mistake by a lot.
		expect(lifetimeFor(OBJECT, 404)).toBe(MINUTES);
		expect(lifetimeFor(DERIVED, 400)).toBe(MINUTES);
		expect(lifetimeFor(DERIVED, 413)).toBe(MINUTES);
		expect(lifetimeFor(OBJECT, 416)).toBe(MINUTES);
		expect(lifetimeFor(SYMLINK, 404)).toBe(MINUTES);
		expect(lifetimeFor(PROXIED, 502)).toBe(MINUTES);
	});
});

describe('cacheControl', () => {
	const app = new Hono();
	app.use('*', cacheControl);
	app.get(OBJECT, (c) => c.text('bytes'));
	app.get(SYMLINK, (c) => c.redirect('/object/x.svg', 302));
	app.get('/missing', (c) => c.json({ error: 'not found' }, 404));
	app.get('/preset', (c) => {
		c.header('Cache-Control', 'no-store');
		return c.text('special');
	});

	async function policy(url: string): Promise<string | null> {
		return (await app.request(url)).headers.get('Cache-Control');
	}

	it('stamps whatever the rule says, so nothing leaves here unstamped', async () => {
		expect(await policy(OBJECT)).toBe(YEAR);
		expect(await policy(SYMLINK)).toBe(HOUR);
		expect(await policy('/missing')).toBe(MINUTES);
	});

	it('never overrides a header a route set deliberately', async () => {
		// Which is how `/favicon.ico` keeps its year and `/robots.txt` its five minutes: both
		// are statements this host makes rather than answers the rule above can classify.
		expect(await policy('/preset')).toBe('no-store');
	});
});

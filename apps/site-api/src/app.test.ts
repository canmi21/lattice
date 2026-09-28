import { URLS } from '@canmi/urls';
import { describe, expect, it } from 'vitest';
import app from './app';

const dev = `${new URL(URLS.apps.development.api).origin}/`;
const prod = `${new URL(URLS.apps.production.api).origin}/`;

describe('GET /', () => {
	it('sends a development request to the development site', async () => {
		const res = await app.fetch(new Request(dev));
		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(`${URLS.apps.development.site}/?ref=api`);
	});

	it('sends a production request to the production site', async () => {
		const res = await app.fetch(new Request(prod));
		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(`${URLS.apps.production.site}/?ref=api`);
	});
});

describe('GET /favicon.ico', () => {
	// Permanent, and pointing at the layer that owns the name rather than at the bytes. The year
	// is honest for the same reason: the name never moves, and what it currently means is the
	// alias layer's to answer, briefly. The same answer the site and the CDN give.
	it('points at the permanent name for the matching environment', async () => {
		const local = await app.fetch(new Request(`${dev}favicon.ico`));
		expect(local.status).toBe(301);
		const name = '/symlink/favicon.ico';
		expect(local.headers.get('Location')).toBe(`${URLS.apps.development.alias}${name}`);
		expect(local.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

		const remote = await app.fetch(new Request(`${prod}favicon.ico`));
		expect(remote.headers.get('Location')).toBe(`${URLS.apps.production.alias}${name}`);
	});
});

describe('GET /robots.txt', () => {
	it('asks crawlers to stay out entirely', async () => {
		const res = await app.fetch(new Request(`${prod}robots.txt`));
		expect(await res.text()).toContain('Disallow: /');
	});
});

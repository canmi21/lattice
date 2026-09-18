import { DEVELOPMENT_PORTS, URLS, loopbackUrl } from '@canmi/urls';
import { describe, expect, it } from 'vitest';
import app from './app';

const dev = `${URLS.apps.development.api}/`;
const prod = `${URLS.apps.production.api}/`;

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
	// Permanent, and pointing at the layer that owns the name rather than at the bytes. What the
	// name currently means is that layer's to answer, and it answers temporarily.
	it('points at the alias layer for the matching environment', async () => {
		const local = await app.fetch(new Request(`${dev}favicon.ico`));
		expect(local.status).toBe(301);
		expect(local.headers.get('Location')).toBe(`${URLS.apps.development.alias}/favicon.ico`);

		const remote = await app.fetch(new Request(`${prod}favicon.ico`));
		expect(remote.headers.get('Location')).toBe(`${URLS.apps.production.alias}/favicon.ico`);
	});
});

describe('GET /robots.txt', () => {
	it('asks crawlers to stay out entirely', async () => {
		const res = await app.fetch(new Request(`${prod}robots.txt`));
		expect(await res.text()).toContain('Disallow: /');
	});
});

describe('CORS', () => {
	it('allows the site', async () => {
		const res = await app.fetch(
			new Request(prod, { headers: { Origin: URLS.apps.production.site } }),
		);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe(URLS.apps.production.site);
	});

	// A loopback origin used to be allowed whatever its port, so a second checkout's site
	// could reach this API. There is no second checkout, and an unlisted port is a stranger.
	it('does not allow a loopback origin on an unlisted port', async () => {
		const other = 'http://localhost:26611';
		const res = await app.fetch(new Request(dev, { headers: { Origin: other } }));
		expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});

	// One machine, two spellings. The list names `localhost`; browsing the development site at
	// 127.0.0.1 answered with no header at all and the homepage 500ed, while the same page
	// worked by name. See `allowOrigin`.
	it('allows the development site by IP as well as by name', async () => {
		const byIp = loopbackUrl(DEVELOPMENT_PORTS.site);
		const res = await app.fetch(new Request(dev, { headers: { Origin: byIp } }));
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe(byIp);
	});

	// And only in development: production's list is exactly the list.
	it('refuses that same origin when the request arrived in production', async () => {
		const byIp = loopbackUrl(DEVELOPMENT_PORTS.site);
		const res = await app.fetch(new Request(prod, { headers: { Origin: byIp } }));
		expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});

	// SvelteKit simulates CORS inside `load` and throws on an answer with no header, so the
	// site's own server rendering is the request that arrives without an `Origin` at all.
	it('answers a request that sent no origin', async () => {
		const res = await app.fetch(new Request(prod));
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(res.headers.get('Vary')).toContain('Origin');
	});

	it('does not allow an unknown origin', async () => {
		// The list is an allowlist; anything not on it gets no header at all, which is what
		// makes a browser refuse the response.
		const res = await app.fetch(new Request(prod, { headers: { Origin: 'https://evil.test' } }));
		expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});
});

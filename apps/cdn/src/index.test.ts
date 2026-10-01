import { URLS } from '@canmi/urls';
import { RESOLVED } from '@canmi/cache';
import { describe, expect, it, vi } from 'vitest';
import app from './index';

const CID = '44b6081deaf0242ca3bf83d62a3b6c95';

// A literal rather than an interpolation: the reference check reads URLs out of source and a
// template one reads as an undeclared address. The host is never resolved -- only the path
// matters -- but it must not be one this worker reads as development.
const HOST = 'https://cdn.example';

const HOUR = 'public, max-age=3600';
const MINUTES = 'public, max-age=300';

async function ask(path: string, init?: RequestInit): Promise<Response> {
	return app.fetch(new Request(HOST + path, init), {} as never);
}

/**
 * The names this host answers for beside the three groups, and what each promises.
 *
 * Three statements and a forwarding address: where the site is, where the icon's name lives,
 * what a crawler may take, and where the proxies moved to.
 */
describe('the fixed names', () => {
	it('sends the root to the site, permanently', async () => {
		const res = await ask('/');
		// Permanent because the site's address is not a thing that changes. The hour is what
		// every answer that names rather than identifies keeps.
		expect(res.status).toBe(301);
		expect(res.headers.get('Location')).toBe(`${URLS.apps.production.site}/?ref=cdn`);
		expect(res.headers.get('Cache-Control')).toBe(HOUR);
	});

	it('follows its own mark for the browser, in one hop', async () => {
		const object = `${URLS.apps.production.cdn}/object/abc.ico`;
		const fetching = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 302, headers: { Location: object } }));
		const res = await ask('/favicon.ico');
		expect(String(fetching.mock.calls[0]?.[0])).toBe(
			`${URLS.apps.production.alias}/symlink/cdn/favicon.ico`,
		);
		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(object);
		// What the alias layer's own answer keeps: the publication delay, stale through an outage.
		expect(res.headers.get('Cache-Control')).toBe(RESOLVED);
		fetching.mockRestore();
	});

	it('serves its own robots policy, briefly, rather than resolving one', async () => {
		const res = await ask('/robots.txt');
		expect(res.status).toBe(200);
		// A robots policy is a statement about the host serving it, and these hosts differ, so
		// this is the one name here that is not a shortcut to somewhere else.
		expect(await res.text()).toContain('User-agent: *');
		expect(res.headers.get('Cache-Control')).toBe(MINUTES);
	});

	it('answers its own security.txt', async () => {
		const res = await ask('/.well-known/security.txt');
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('Contact: mailto:');
	});
});

/**
 * The proxies moved under `/proxy`, and the old prefix is kept as a redirect rather than as a
 * second spelling of the same route. 308 because the move is permanent and a client must not
 * turn what it was doing into a `GET` on the way.
 */
describe('where the proxies used to answer', () => {
	it('forwards the whole path permanently, without letting the method change', async () => {
		const res = await ask('/github/release/rdm/latest/rdm.dmg');
		expect(res.status).toBe(308);
		expect(res.headers.get('Location')).toBe('/proxy/github/release/rdm/latest/rdm.dmg');
		expect(res.headers.get('Cache-Control')).toBe(HOUR);
	});

	it('carries the query, which is where the avatar route takes its size', async () => {
		const res = await ask('/github/avatar/canmi21?width=64');
		expect(res.status).toBe(308);
		expect(res.headers.get('Location')).toBe('/proxy/github/avatar/canmi21?width=64');
	});
});

/**
 * Everything outside the three groups, and `400` rather than `404`.
 *
 * A `404` here is a fact about the bucket and becomes untrue the moment somebody publishes. An
 * address outside the groups is a fact about the address: there is no such route and there
 * never will be, and collapsing the two throws away the signal that tells a sweep from a typo.
 */
describe('the catch-all', () => {
	it('refuses every per-type address this host used to answer', async () => {
		const paths = [
			`/image/${CID}.avif`,
			`/video/${CID}.mp4`,
			`/captions/${CID}.vtt`,
			`/content/${CID}.json`,
			`/page/${CID}.json`,
			`/markdown/${CID}.md`,
			`/license/${CID}.txt`,
		];
		const answers = await Promise.all(paths.map(async (path) => [path, await ask(path)] as const));
		for (const [path, res] of answers) {
			expect(res.status, path).toBe(400);
		}
		expect(await answers[0]?.[1].json()).toMatchObject({
			status: 'error',
			code: 'invalid_address',
		});
	});

	it('refuses a single segment, a deeper one, and holds neither for long', async () => {
		const single = await ask('/anything');
		expect(single.status).toBe(400);
		expect(single.headers.get('Cache-Control')).toBe(MINUTES);
		// The id is one segment. The fan-out it is stored under is the bucket's business.
		expect((await ask(`/object/44/b6/${CID}.avif`)).status).toBe(400);
		expect((await ask('/proxy/nobody/thing')).status).toBe(400);
		// Resolution left this host with the rest of it: a name is the one thing the layer below
		// the API must never have to ask about. See spec/architecture/delivery.md.
		expect((await ask('/symlink/favicon.ico')).status).toBe(400);
	});

	it('refuses a method the bucket cannot answer, in the envelope every refusal uses', async () => {
		// hono's own answer would be `text/plain`, which is the one shape a caller reading JSON
		// reads as a syntax error.
		const res = await ask('/robots.txt', { method: 'POST' });
		expect(res.status).toBe(400);
		expect(res.headers.get('Content-Type')).toContain('application/json');
		expect(await res.json()).toMatchObject({ status: 'error', code: 'invalid_address' });
	});
});

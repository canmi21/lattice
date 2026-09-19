import { URLS } from '@canmi/urls';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from './index';

const CID = '44b6081deaf0242ca3bf83d62a3b6c95';
const RID = 'k7m2x';

// A literal rather than an interpolation: the reference check reads URLs out of source and a
// template one reads as an undeclared address. Never resolved -- every fetch below is stubbed --
// but it must not be a host this worker reads as development.
const HOST = 'https://alias.example';

const MINUTES = 'public, max-age=300';

/** Whatever the API is standing in for this time, in whichever shape that route answers with. */
function answering(status: number, body: unknown) {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async () => Response.json(body, { status }));
}

const named = {
	status: 'success',
	data: { name: 'favicon.svg', type: 'image', cid: CID, extension: 'svg' },
};

afterEach(() => {
	vi.restoreAllMocks();
});

async function ask(path: string, init?: RequestInit): Promise<Response> {
	return app.fetch(new Request(HOST + path, init));
}

/**
 * A resource id, answered with whatever that resource declares itself canonically to be.
 *
 * The record is the authority: this layer expands what it finds there and refuses when it finds
 * nothing, because a resource with no canonical form has no address to be sent to.
 */
describe('a resource', () => {
	it('is answered with the address its record declares', async () => {
		const fetching = answering(200, { resource: RID, canonical: `cid:${CID}.avif` });
		const res = await ask(`/${RID}`);

		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(`${URLS.apps.production.cdn}/object/${CID}.avif`);
		// Asked by rid, which is what `/media` takes. A cid names bytes and would answer nothing
		// about the thing. See spec/architecture/resource.md, "Two ids".
		expect(fetching).toHaveBeenCalledWith(`${URLS.apps.production.api}/media?rid=${RID}`);
	});

	it('sends a declared slug to the site rather than to the bytes', async () => {
		answering(200, { resource: RID, canonical: 'slug:reaching-a-reader' });
		const res = await ask(`/${RID}`);
		expect(res.headers.get('Location')).toBe(`${URLS.apps.production.site}/reaching-a-reader`);
	});

	// Refuse, never guess. Nothing writes the field yet, so this is what every rid answers today,
	// and it stays the answer for any resource that declines to name one.
	it('refuses a resource that declares no canonical form', async () => {
		answering(200, { resource: RID, type: 'media.image.photo' });
		const res = await ask(`/${RID}`);

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ status: 'error', message: 'no_canonical_form' });
		expect(res.headers.get('Cache-Control')).toBe(MINUTES);
	});

	// The value becomes the path of a redirect this layer issues, so it is held to the pattern
	// rather than to a prefix -- an unchecked one is a way to point this host anywhere.
	it('refuses a declaration it cannot expand, rather than redirecting somewhere', async () => {
		for (const canonical of ['mailto:nobody@example.com', 'cid:notahash.avif', `cid:${CID}`]) {
			answering(200, { resource: RID, canonical });
			expect((await ask(`/${RID}`)).status, canonical).toBe(404);
			vi.restoreAllMocks();
		}
	});

	it('is 404 for a rid the corpus has no record of', async () => {
		answering(404, { status: 'error', message: 'not_found' });
		const res = await ask(`/${RID}`);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ status: 'error', message: 'no_such_resource' });
	});

	// Every icon on a page comes through this host, so an unreachable upstream held for five
	// minutes is an outage rather than a blip. The same asymmetry apps/cdn keeps.
	it('never stores the fact that the layer behind it was unreachable', async () => {
		answering(500, { status: 'error', message: 'unavailable' });
		const res = await ask(`/${RID}`);

		expect(res.status).toBe(502);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	});
});

/**
 * A permanent name, answered with the object it currently means.
 *
 * The name is what a browser, a mail client or another page can construct on its own and it
 * never changes; what it stands for does, whenever the mark behind it is redrawn. So the answer
 * is a redirect, and a temporary one: this host promises where the name lives, not what it holds.
 */
describe('a name this site publishes', () => {
	it('is answered with where it points right now', async () => {
		const fetching = answering(200, named);
		const res = await ask('/symlink/favicon.svg');

		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(`${URLS.apps.production.cdn}/object/${CID}.svg`);
		expect(fetching).toHaveBeenCalledWith(`${URLS.apps.production.api}/asset?name=favicon.svg`);
	});

	it('is 404 for a name the corpus does not publish, and holds that briefly', async () => {
		answering(404, { status: 'error', message: 'not_found' });
		const res = await ask('/symlink/nothing.svg');

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ status: 'error', message: 'no_such_name' });
		expect(res.headers.get('Cache-Control')).toBe(MINUTES);
	});

	// Held in the route pattern rather than asked upstream: a segment with no extension is not a
	// name this site publishes, so it is an address that could never resolve.
	it('is not even asked about when the name could not be one', async () => {
		const fetching = answering(200, named);
		expect((await ask('/symlink/favicon')).status).toBe(400);
		expect((await ask('/symlink/Favicon.svg')).status).toBe(400);
		expect((await ask('/symlink/favicon.svg/more')).status).toBe(400);
		expect(fetching).not.toHaveBeenCalled();
	});
});

/**
 * The names this host answers for beside the two it resolves, and everything outside them.
 *
 * `400` rather than `404`, for the reason apps/cdn keeps the same split: a `404` here says the
 * corpus publishes no such thing and stops being true at the next publication, where an address
 * none of the routes expresses names nothing at all and never will.
 */
describe('the rest of the host', () => {
	it('sends the root to the site, permanently', async () => {
		const res = await ask('/');
		expect(res.status).toBe(301);
		expect(res.headers.get('Location')).toBe(`${URLS.apps.production.site}/?ref=alias`);
	});

	it("serves its own robots policy rather than a copy of another host's", async () => {
		const res = await ask('/robots.txt');
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('User-agent: *');
	});

	it('refuses everything else, including the fixed names that moved under the prefix', async () => {
		const fetching = answering(200, named);
		// `favicon.ico` at the root was this host's address until the prefix existed. It is not a
		// rid -- a rid is five characters and carries no dot -- so it parses as nothing.
		expect((await ask('/favicon.ico')).status).toBe(400);
		expect((await ask('/k7m2')).status).toBe(400);
		expect((await ask('/k7m2xy')).status).toBe(400);
		expect((await ask('/symlink')).status).toBe(400);
		expect(fetching).not.toHaveBeenCalled();

		const refused = await ask('/anything');
		expect(await refused.json()).toEqual({ status: 'error', message: 'not_an_address' });
		expect(refused.headers.get('Cache-Control')).toBe(MINUTES);
	});

	it('refuses a method this layer has no answer for, in the envelope every refusal uses', async () => {
		const res = await ask('/robots.txt', { method: 'POST' });
		expect(res.status).toBe(400);
		expect(res.headers.get('Content-Type')).toContain('application/json');
	});
});

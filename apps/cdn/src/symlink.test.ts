import { URLS } from '@canmi/urls';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from './index';

const CID = '44b6081deaf0242ca3bf83d62a3b6c95';

// A literal rather than an interpolation, for the reference check. Never resolved: every fetch
// this file makes is answered by the stub below.
const HOST = 'https://cdn.example';

const HOUR = 'public, max-age=3600';
const MINUTES = 'public, max-age=300';

/** What the API answers `/asset?name=` with, in the envelope every answer of its arrives in. */
function answering(status: number, body: unknown) {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async () => Response.json(body, { status }));
}

const found = {
	status: 'success',
	data: { name: 'favicon.svg', type: 'image', cid: CID, extension: 'svg' },
};

afterEach(() => {
	vi.restoreAllMocks();
});

async function ask(path: string): Promise<Response> {
	return app.fetch(new Request(HOST + path), {} as never);
}

/**
 * A permanent name, answered with the object it currently means.
 *
 * The name is what anything else can construct on its own and it never changes; what it stands
 * for does, whenever the mark behind it is redrawn. So the answer is a redirect, and a temporary
 * one: this host promises where the name lives, not what it points at.
 */
describe('a name this site publishes', () => {
	it('is answered with where it points right now', async () => {
		const fetching = answering(200, found);
		const res = await ask('/symlink/favicon.svg');

		expect(res.status).toBe(302);
		expect(res.headers.get('Location')).toBe(`/object/${CID}.svg`);
		// The question goes to the API, which is the one place a name can be looked up: this
		// host holds no map from names to objects and must not grow one.
		expect(fetching).toHaveBeenCalledWith(`${URLS.apps.production.api}/asset?name=favicon.svg`);
	});

	it('is kept for an hour, which is the target moving rather than the name', async () => {
		answering(200, found);
		const res = await ask('/symlink/favicon.svg');
		expect(res.headers.get('Cache-Control')).toBe(HOUR);
	});

	// A redirect has no body, so there is nothing to seek into and nothing for a tag to
	// identify. The object at the far end carries both.
	it('offers neither ranges nor a validator, having no bytes to describe', async () => {
		answering(200, found);
		const res = await ask('/symlink/favicon.svg');
		expect(res.headers.get('Accept-Ranges')).toBeNull();
		expect(res.headers.get('ETag')).toBeNull();
	});
});

describe('a name this site does not publish', () => {
	it('is 404, and held for as long as any other fact about the corpus', async () => {
		answering(404, { status: 'error', message: 'not_found' });
		const res = await ask('/symlink/nothing.svg');

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ status: 'error', message: 'no_such_name' });
		expect(res.headers.get('Cache-Control')).toBe(MINUTES);
	});

	it('is 502 when the layer that knows cannot be reached', async () => {
		answering(500, { status: 'error', message: 'unavailable' });
		const res = await ask('/symlink/favicon.svg');

		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ status: 'error', message: 'upstream_unavailable' });
	});

	// Held in the route pattern rather than asked upstream: a segment with no extension is not a
	// name this site publishes, so it is an address that could never resolve.
	it('is not even asked about when the name could not be one', async () => {
		const fetching = answering(200, found);
		expect((await ask('/symlink/favicon')).status).toBe(400);
		expect((await ask('/symlink/Favicon.svg')).status).toBe(400);
		expect((await ask('/symlink/favicon.svg/more')).status).toBe(400);
		expect(fetching).not.toHaveBeenCalled();
	});
});

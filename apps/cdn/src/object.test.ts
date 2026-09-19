import { storageKey } from '@canmi/store';
import { describe, expect, it } from 'vitest';
import app from './index';
import object from './object';

const CID = '44b6081deaf0242ca3bf83d62a3b6c95';
const BYTES = 'stored bytes for the object tests';

const YEAR = 'public, max-age=31536000, immutable';
const MINUTES = 'public, max-age=300';

/** A bucket holding exactly the keys named, each with the same body, and nothing else. */
function bucketWith(keys: string[]) {
	const held = (key: string) => keys.includes(key);
	return {
		STORE: {
			head: async (key: string) => (held(key) ? { size: BYTES.length } : null),
			get: async (key: string, options?: { range?: { offset: number; length: number } }) => {
				if (!held(key)) return null;
				const part = options?.range
					? BYTES.slice(options.range.offset, options.range.offset + options.range.length)
					: BYTES;
				return { body: new Response(part).body, httpMetadata: {}, httpEtag: '"e"' };
			},
		},
	} as never;
}

/**
 * The address with no type in it, which is the whole of what this route adds.
 *
 * Everything else about it is the lookup every other route already performs -- the key, the
 * range, the validator -- which is why it calls `serveObject` rather than repeating any of it.
 */
describe('an object named by its id alone', () => {
	it('serves the bytes under the fanned-out key', async () => {
		const response = await object.request(
			`/${CID}.avif`,
			{},
			bucketWith([storageKey(CID, 'avif')]),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(BYTES);
		expect(response.headers.get('Cache-Control')).toBe(YEAR);
	});

	// No table of types to consult: the extension is part of the key and nothing else.
	it('serves whatever extension the name carries', async () => {
		const response = await object.request(`/${CID}.vtt`, {}, bucketWith([storageKey(CID, 'vtt')]));
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/vtt');
	});

	it('answers a range the way every other route does', async () => {
		const response = await object.request(
			`/${CID}.mp4`,
			{ headers: { Range: 'bytes=7-12' } },
			bucketWith([storageKey(CID, 'mp4')]),
		);
		expect(response.status).toBe(206);
		expect(response.headers.get('Content-Range')).toBe(`bytes 7-12/${BYTES.length}`);
		expect(await response.text()).toBe(BYTES.slice(7, 13));
	});

	it('answers a matching validator without touching the bucket, and keeps the year', async () => {
		const bucket = {
			STORE: {
				get: async () => {
					throw new Error('the bucket must not be read for a 304');
				},
			},
		} as never;
		const response = await object.request(
			`/${CID}.avif`,
			{ headers: { 'If-None-Match': `"${CID}.avif"` } },
			bucket,
		);
		expect(response.status).toBe(304);
		expect(response.headers.get('Cache-Control')).toBe(YEAR);
	});

	it('is 404 when the object is absent, and holds that briefly', async () => {
		const response = await object.request(`/${CID}.avif`, {}, bucketWith([]));
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ status: 'error', message: 'not_found' });
		expect(response.headers.get('Cache-Control')).toBe(MINUTES);
	});

	it('is 400 for a shape that could never name an object', async () => {
		const bucket = bucketWith([]);
		expect((await object.request('/not-an-id.avif', {}, bucket)).status).toBe(400);
		// A name with no extension, and one with an empty one: neither is a key.
		expect((await object.request(`/${CID}`, {}, bucket)).status).toBe(400);
		expect((await object.request(`/${CID}.`, {}, bucket)).status).toBe(400);
		const response = await object.request(`/${CID}.a-b`, {}, bucket);
		expect(response.status).toBe(400);
		expect(response.headers.get('Cache-Control')).toBe(MINUTES);
	});
});

describe('the address middleware lets it through', () => {
	// The prefix is not a public type, so without an exemption this never reaches the route.
	it('reaches the route rather than being refused as an address', async () => {
		const response = await app.request(
			`/object/${CID}.avif`,
			{},
			bucketWith([storageKey(CID, 'avif')]),
		);
		expect(response.status).toBe(200);
	});

	// The id is one segment. The fan-out it is stored under is the bucket's business.
	it('still refuses an address carrying the storage layout', async () => {
		const response = await app.request(`/object/44/b6/${CID}.avif`, {}, bucketWith([]));
		expect(response.status).toBe(400);
	});
});

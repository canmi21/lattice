import { OBJECTS, objectKey, type ObjectPrefix } from '@canmi/store';
import { describe, expect, it } from 'vitest';
import app, { PLAIN_OBJECTS } from './index';
import { stored } from './stored';

const CID = '44b6081deaf0242ca3bf83d62a3b6c95';

const BYTES = 'stored bytes for the range tests';

/** A bucket holding exactly the keys named, each with the same body, and nothing else. */
function bucketWith(keys: string[]) {
	const held = (key: string) => keys.includes(key);
	return {
		PUBLIC: {
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
 * The failure this whole file is here for.
 *
 * `video` and `captions` were declared, written by apps/cms, resolved into URLs by apps/site, and
 * had no route -- so a request fell through to the worker's direct-key lookup, which reads the
 * path as written and asked the bucket for `video/{cid}.mp4` where `video/{ab}/{cd}/{cid}.mp4` is
 * stored. Four rung URLs answered 404 with the files sitting on disk. Nothing failed; a page just
 * did not play.
 *
 * So the test is not "does the video route work" but "is every kind the store declares actually
 * reachable". A new kind added to `OBJECTS` fails here until somebody routes it.
 */
describe('every content-addressed kind is reachable', () => {
	/** Kinds this worker does not serve, and why. Anything else must have a route. */
	const ELSEWHERE: Record<string, string> = {
		// A record is read by apps/api, which answers questions about an asset rather than
		// handing back its bytes. Serving it from here too would be two answers to one question.
		meta: 'served by apps/api',
	};

	it.each(Object.keys(OBJECTS) as ObjectPrefix[])('routes %s', async (prefix) => {
		if (ELSEWHERE[prefix]) return;
		const extension = OBJECTS[prefix].extension ?? 'avif';
		const key = objectKey(prefix, CID, extension);
		const response = await app.request(`/${prefix}/${CID}.${extension}`, {}, bucketWith([key]));
		// 404 is what the fallback answers when it looks the key up unfanned, so a pass here is
		// the whole claim: the request reached a route that knows where the object lives.
		expect(response.status, `/${prefix} has no route`).toBe(200);
	});
});

describe('a kind that stores one format', () => {
	const route = stored('video', 'mp4');

	it('serves the object under its fanned-out key', async () => {
		const response = await route.request(
			`/${CID}.mp4`,
			{},
			bucketWith([objectKey('video', CID)]),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('video/mp4');
		// What tells a player it may seek. Without it a browser fetches a whole rung to read a
		// byte near the end of it.
		expect(response.headers.get('Accept-Ranges')).toBe('bytes');
	});

	it('serves the bytes a player asks for, as 206', async () => {
		const response = await route.request(
			`/${CID}.mp4`,
			{ headers: { Range: 'bytes=7-12' } },
			bucketWith([objectKey('video', CID)]),
		);
		expect(response.status).toBe(206);
		expect(response.headers.get('Content-Range')).toBe(`bytes 7-12/${BYTES.length}`);
		expect(await response.text()).toBe(BYTES.slice(7, 13));
		// The validator is the object's, not the range's: a client holding it holds these bytes
		// whichever part of them it asked for.
		expect(response.headers.get('ETag')).toBe(`"${CID}.mp4"`);
	});

	it('answers 416 for a range past the end, and says how long the object is', async () => {
		// Not 404. The object is there and the question was wrong, and the size is what lets the
		// client ask again -- a 404 would send it looking for a file it had already found.
		const response = await route.request(
			`/${CID}.mp4`,
			{ headers: { Range: 'bytes=9999-' } },
			bucketWith([objectKey('video', CID)]),
		);
		expect(response.status).toBe(416);
		expect(response.headers.get('Content-Range')).toBe(`bytes */${BYTES.length}`);
	});

	it('answers a matching validator without touching the bucket', async () => {
		// The id is a hash of the bytes, so a client holding this tag holds these bytes. Reading
		// the object to confirm it would only prove what the URL already stated.
		const bucket = {
			PUBLIC: {
				get: async () => {
					throw new Error('the bucket must not be read for a 304');
				},
			},
		} as never;
		const response = await route.request(
			`/${CID}.mp4`,
			{ headers: { 'If-None-Match': `"${CID}.mp4"` } },
			bucket,
		);
		expect(response.status).toBe(304);
	});

	it('refuses a name that is not a content id, and a format it does not store', async () => {
		const bucket = bucketWith([]);
		expect((await route.request('/not-an-id.mp4', {}, bucket)).status).toBe(400);
		// `.webm` is not a second format to look for. It is a request for something this
		// repository does not publish, and answering 404 would suggest it might one day be there.
		expect((await route.request(`/${CID}.webm`, {}, bucket)).status).toBe(400);
	});

	it('is 404 when the object is genuinely absent', async () => {
		expect((await route.request(`/${CID}.mp4`, {}, bucketWith([]))).status).toBe(404);
	});
});

describe('the list index mounts from', () => {
	it('holds only kinds that store a single format', () => {
		// `stored` takes the extension from the table and has nothing to choose between. Moving
		// `image` into this list would silently serve one format under every request.
		for (const prefix of PLAIN_OBJECTS) {
			expect(OBJECTS[prefix].extension, `${prefix} stores more than one format`).not.toBeNull();
		}
	});
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	type Bindings,
	contentTypeFor,
	isContentId,
	isUnsatisfiable,
	read,
	recordKey,
	storageKey,
	toResponse,
} from './index';

/** Enough of an R2 bucket to answer one key. */
function bucket(keys: Record<string, string>) {
	return {
		get: async (key: string) =>
			key in keys
				? { body: new Response(keys[key]).body, httpMetadata: {}, httpEtag: '"live"' }
				: null,
	} as unknown as NonNullable<Bindings['STORE']>;
}

/** Enough of the assets fetcher to answer one path. */
function assets(paths: Record<string, string>) {
	return {
		fetch: async (url: string) => {
			const key = new URL(url).pathname.slice(1);
			return key in paths ? new Response(paths[key]) : new Response('', { status: 404 });
		},
	} as unknown as NonNullable<Bindings['ASSETS']>;
}

describe('read', () => {
	it('prefers the bucket when both are bound', async () => {
		// Deploying with a stale assets binding must not quietly serve last week's file.
		const env = { STORE: bucket({ 'a.txt': 'bucket' }), ASSETS: assets({ 'a.txt': 'local' }) };
		const found = await read(env, 'a.txt');
		expect(await new Response(found?.body).text()).toBe('bucket');
	});

	it('falls back to local files when only assets are bound', async () => {
		const found = await read({ ASSETS: assets({ 'a.txt': 'local' }) }, 'a.txt');
		expect(await new Response(found?.body).text()).toBe('local');
	});

	it('reports a miss the same way from either store', async () => {
		// Both workers turn null into a 404, so the two stores have to agree on what absent is.
		expect(await read({ STORE: bucket({}) }, 'gone.txt')).toBeNull();
		expect(await read({ ASSETS: assets({}) }, 'gone.txt')).toBeNull();
	});

	it('refuses to run with nothing bound', async () => {
		// Silently returning null here would look exactly like an empty bucket, and a
		// misconfigured deployment would read as a site whose assets had all been deleted.
		await expect(read({}, 'a.txt')).rejects.toThrow('no store bound');
	});
});

describe('contentTypeFor', () => {
	it('maps the formats actually stored', () => {
		expect(contentTypeFor('favicon/a.com/light.svg')).toBe('image/svg+xml');
		expect(contentTypeFor('favicon/a.com/dark.ico')).toBe('image/x-icon');
		expect(contentTypeFor('44/b6/44b6081deaf0242ca3bf83d62a3b6c95.woff2')).toBe('font/woff2');
		expect(contentTypeFor('meta/44b6081deaf0242ca3bf83d62a3b6c95.json')).toBe('application/json');
	});

	it('falls back rather than guessing', () => {
		expect(contentTypeFor('unknown')).toBe('application/octet-stream');
	});
});

describe('where an object lives', () => {
	const CID = '44b6081deaf0242ca3bf83d62a3b6c95';

	/**
	 * The content id and nothing else. A type directory here would be a second place the same
	 * fact is written, and the CDN's `/{type}/` is where a reader gets one instead.
	 *
	 * The split exists for a filesystem mirror rather than for R2, which has no directories: two
	 * characters, then two more, then the whole id again -- matching what apps/cms writes.
	 */
	it.each([
		['avif', `44/b6/${CID}.avif`],
		['vtt', `44/b6/${CID}.vtt`],
		['mp4', `44/b6/${CID}.mp4`],
		['txt', `44/b6/${CID}.txt`],
		['json', `44/b6/${CID}.json`],
	])('files a .%s under its id alone', (extension, expected) => {
		expect(storageKey(CID, extension)).toBe(expected);
	});

	/**
	 * Two formats of one picture differ only in their extension, which is the whole reason the
	 * extension is kept: a bucket downloaded whole is still a directory of files that open.
	 */
	it('separates two formats of one id by extension alone', () => {
		expect(storageKey(CID, 'avif')).not.toBe(storageKey(CID, 'png'));
		expect(storageKey(CID, 'avif').slice(0, 6)).toBe(storageKey(CID, 'png').slice(0, 6));
	});

	/**
	 * A record is named, not addressed by its own content, because the API rewrites it in place
	 * when its asset is re-derived. It lives in the other bucket for exactly that reason -- a
	 * mutable key among immutable ones earned a year of `immutable` it could not keep.
	 *
	 * The name is the rid, which is what stops the key ending in a hash and reading as though it
	 * were addressed by its content.
	 */
	it('keeps a record named by its resource id, in the bucket the CDN cannot reach', () => {
		expect(recordKey('k7m2x')).toBe('meta/k7m2x.json');
	});

	it('accepts an id of the shape apps/cms writes, and nothing else', () => {
		expect(isContentId(CID)).toBe(true);
		expect(isContentId(CID.toUpperCase())).toBe(false);
		expect(isContentId(CID.slice(0, 31))).toBe(false);
		expect(isContentId(`${CID}00`)).toBe(false);
		expect(isContentId('../../etc/passwd')).toBe(false);
	});
});

describe('a range request', () => {
	const BYTES = 'abcdefghij';

	function bucket() {
		return {
			STORE: {
				head: async () => ({ size: BYTES.length }),
				get: async (_key: string, options?: { range?: { offset: number; length: number } }) => {
					const part = options?.range
						? BYTES.slice(options.range.offset, options.range.offset + options.range.length)
						: BYTES;
					return { body: new Response(part).body, httpMetadata: {}, httpEtag: '"e"' };
				},
			},
		} as never;
	}

	async function served(range: string | null) {
		const found = await read(bucket(), 'video/ab/cd/x.mp4', range);
		if (found === null) throw new Error('absent');
		if (isUnsatisfiable(found)) return { status: 416, total: found.total, body: '' };
		const response = toResponse(found);
		return {
			status: response.status,
			contentRange: response.headers.get('Content-Range'),
			body: await response.text(),
		};
	}

	it('serves the three shapes the grammar allows', async () => {
		// `a-b`, `a-` to the end, and `-n` counted back from it. A player uses all three: the
		// last one is how it reads an MP4's index without fetching the file.
		expect(await served('bytes=2-4')).toMatchObject({ status: 206, body: 'cde' });
		expect(await served('bytes=7-')).toMatchObject({ status: 206, body: 'hij' });
		expect(await served('bytes=-3')).toMatchObject({ status: 206, body: 'hij' });
	});

	it('reports what it served and how long the whole object is', async () => {
		expect((await served('bytes=2-4')).contentRange).toBe('bytes 2-4/10');
		expect((await served('bytes=-3')).contentRange).toBe('bytes 7-9/10');
	});

	it('clamps an end past the last byte rather than refusing it', async () => {
		// A client that asks for more than there is has asked a satisfiable question about the
		// part that exists, which is what a resumed download does at the tail of a file.
		expect(await served('bytes=8-99')).toMatchObject({ status: 206, body: 'ij' });
		expect(await served('bytes=-99')).toMatchObject({ status: 206, body: BYTES });
	});

	it('refuses a start past the end, with the size', async () => {
		expect(await served('bytes=10-')).toMatchObject({ status: 416, total: 10 });
		expect(await served('bytes=99-100')).toMatchObject({ status: 416, total: 10 });
		// `-0` is well formed and asks for the last nothing, which names no byte either.
		expect(await served('bytes=-0')).toMatchObject({ status: 416, total: 10 });
	});

	it('serves the whole object for anything it does not implement', async () => {
		// A recipient that does not understand a range request answers with the whole
		// representation, which is what every one of these is: a unit that is not bytes, the
		// multipart form nothing here asks for, a backwards range, and plain nonsense.
		for (const header of ['items=0-1', 'bytes=0-1,5-6', 'bytes=5-2', 'bytes=x-y', 'nonsense']) {
			expect(await served(header), header).toMatchObject({ status: 200, body: BYTES });
		}
	});

	it('is a whole object when nothing asks for a range', async () => {
		expect(await served(null)).toMatchObject({ status: 200, body: BYTES });
	});

	it('advertises that it takes them, on every object', async () => {
		// The header is what tells a client it may ask at all. It goes on whole responses too,
		// which is where a player reads it before it ever sends a Range.
		const found = await read(bucket(), 'video/ab/cd/x.mp4');
		expect(toResponse(found!).headers.get('Accept-Ranges')).toBe('bytes');
	});
});

/**
 * The two declarations of the layout, held together.
 *
 * apps/cms writes what the workers read, so the two have to agree about where an object lands.
 * They did not once: clips were given a path on the writing side and no key on the reading side,
 * and four rung URLs answered 404 while the files sat on disk. This is the test that fails
 * instead. Read off the Rust source rather than restated, so a change there has to come here.
 */
it('files an object exactly where apps/cms writes it', () => {
	const source = readFileSync(
		fileURLToPath(new URL('../../../apps/cms/src/image/store.rs', import.meta.url).href),
		'utf8',
	);
	const body = /fn object_path\([^)]*\) -> PathBuf \{([\s\S]*?)\n\}/.exec(source);
	expect(body, 'object_path moved or changed shape in apps/cms').not.toBeNull();

	// Two fanout segments off the id, then `{cid}.{ext}`, and no prefix between the root and the
	// first segment. A type directory reappearing on either side is what this catches.
	expect(body![1]).toContain('let (first, second) = fanout(cid);');
	expect(body![1]).toContain('public_root.join(first).join(second)');
	expect(body![1]).toContain('format!("{cid}.{extension}")');
	expect(storageKey('44b6081deaf0242ca3bf83d62a3b6c95', 'avif')).toBe(
		`44/b6/44b6081deaf0242ca3bf83d62a3b6c95.avif`,
	);

	// A record is not an object and must not acquire the fan-out: it is named, and it lives in
	// the metadata tree that this side reaches through `recordKey`.
	const record = /fn meta_path\([^)]*\) -> PathBuf \{([\s\S]*?)\n\}/.exec(source);
	expect(record, 'meta_path moved or changed shape in apps/cms').not.toBeNull();
	expect(record![1]).toContain('.join("meta").join(format!("{blake3}.json"))');
});

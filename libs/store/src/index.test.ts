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

/** A source file of apps/cms, read for what it declares rather than for what it does. */
function cms(path: string): string {
	return readFileSync(
		fileURLToPath(new URL(`../../../apps/cms/${path}`, import.meta.url).href),
		'utf8',
	);
}

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
	const ID = '44b6081deaf0242ca3bf83d62a3b6c95';

	/**
	 * Every format `data/bucket/objects` holds, counted rather than remembered.
	 *
	 * This test was already named after reality and asserting fiction -- a `favicon/` prefix the
	 * rename `data/architecture` records took away -- which is how a site whose stored pictures are
	 * AVIF kept a `contentTypeFor` with no `avif` arm. Written down rather than walked, because the
	 * bytes are not in git and an empty clone would pass:
	 * `find data/bucket/objects -type f | sed 's/.*\.//' | sort | uniq -c`.
	 */
	it.each([
		['avif', 'image/avif'],
		['png', 'image/png'],
		['svg', 'image/svg+xml'],
		['jpeg', 'image/jpeg'],
		['ico', 'image/x-icon'],
		['mp4', 'video/mp4'],
		['vtt', 'text/vtt'],
		['woff2', 'font/woff2'],
		['json', 'application/json'],
		['txt', 'text/plain; charset=utf-8'],
		['md', 'text/markdown; charset=utf-8'],
	])('serves a stored .%s as %s', (extension, contentType) => {
		expect(contentTypeFor(`44/b6/${ID}.${extension}`)).toBe(contentType);
	});

	/** The other bucket's one shape: a record, named by its rid rather than addressed. */
	it('serves a record as JSON', () => {
		expect(contentTypeFor('meta/k7m2x.json')).toBe('application/json');
	});

	/**
	 * Nothing writes a `.jpg`; `apps/cms/src/extension.rs` spells every JPEG `jpeg`. The arm stays
	 * for the case this whole function exists for -- an object put in the bucket by hand, which is
	 * also the only object with no `httpMetadata` to serve instead.
	 */
	it('still answers for a name this repository does not write', () => {
		expect(contentTypeFor(`44/b6/${ID}.jpg`)).toBe('image/jpeg');
	});

	it('falls back rather than guessing', () => {
		expect(contentTypeFor('unknown')).toBe('application/octet-stream');
	});
});

/**
 * The favicon round trip, which crosses the language boundary twice and was held by nothing.
 *
 * `apps/cms/src/favicon/fetch.rs` names a content type from a URL when the server declares none,
 * `apps/cms/src/extension.rs` turns that into the extension the file is stored under, and
 * `contentTypeFor` turns that back into what a browser is served. A leg that does not close is an
 * icon that downloads instead of drawing. Both Rust ends are read rather than restated.
 */
describe('the loop an icon travels', () => {
	const ID = '44b6081deaf0242ca3bf83d62a3b6c95';

	const EXTENSION_RS = cms('src/extension.rs');
	const FETCH_RS = cms('src/favicon/fetch.rs');

	// `JPEG` is a constant on the Rust side rather than a literal, because both naming paths there
	// have to share one spelling. An arm naming it resolves to whatever that constant holds.
	const JPEG = /const JPEG: &str = "([a-z]+)";/.exec(EXTENSION_RS)?.[1];

	/** Every extension an icon is stored under, in the order `ICON_EXTENSIONS` tries them. */
	const stored = /pub const ICON_EXTENSIONS: \[&str; \d+\] = \[([^\]]*)\]/
		.exec(EXTENSION_RS)?.[1]
		?.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => (entry === 'JPEG' ? JPEG : entry.replaceAll('"', '')));

	/** `for_icon`'s chain: the substrings each arm looks for, and what it stores the file as. */
	const chain = [...EXTENSION_RS.matchAll(/if ([^{]+)\{\s*Some\((?:"([a-z]+)"|JPEG)\)/g)].map(
		(arm) => ({
			needles: [...arm[1]!.matchAll(/contains\("([a-z]+)"\)/g)].map((found) => found[1]!),
			extension: arm[2] ?? JPEG,
		}),
	);

	/** What `for_icon` answers, by the rules read out of it rather than by a copy of them. */
	function forIcon(contentType: string): string | undefined {
		const lower = contentType.toLowerCase();
		return chain.find((arm) => arm.needles.some((needle) => lower.includes(needle)))?.extension;
	}

	/** `infer_content_type`'s arms: the URL extensions it recognises, and the type each names. */
	const inferred = [...FETCH_RS.matchAll(/\(\) if ([^=]+)=> "([a-z0-9/+.-]+)"/g)].map((arm) => ({
		extensions: [...arm[1]!.matchAll(/ends_with\("\.([a-z0-9]+)"\)/g)].map((found) => found[1]!),
		contentType: arm[2]!,
	}));

	it('serves every extension apps/cms stores an icon under', () => {
		expect(JPEG, 'the JPEG constant moved in apps/cms').toBeDefined();
		expect(stored, 'ICON_EXTENSIONS moved or changed shape in apps/cms').toBeDefined();
		expect(chain.length, 'for_icon moved or changed shape in apps/cms').toBeGreaterThan(0);

		for (const extension of stored!) {
			const contentType = contentTypeFor(`44/b6/${ID}.${extension}`);
			// The fallback is the failure: a browser hands the user a download instead of an icon.
			expect(contentType, `an icon is stored as .${extension} and served as nothing`).not.toBe(
				'application/octet-stream',
			);
			// And it has to be the type that names this same extension again, or the two legs
			// disagree about which file the bytes are: stored as one thing, served as another.
			expect(forIcon(contentType), `.${extension} is served as ${contentType}`).toBe(extension);
		}
	});

	it('stores every type the fetcher invents when a server declares none', () => {
		expect(
			inferred.length,
			'infer_content_type moved or changed shape in apps/cms',
		).toBeGreaterThan(0);

		for (const arm of inferred.filter((found) => found.contentType.startsWith('image/'))) {
			// An extension the fetcher reads off a URL, turned into a type, has to be a type the
			// store side accepts -- otherwise the icon is fetched and then dropped for its name.
			expect(stored, `${arm.contentType} is inferred from a URL but never stored`).toContain(
				forIcon(arm.contentType),
			);
			expect(arm.extensions.length).toBeGreaterThan(0);
		}
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
	// the metadata tree that this side reaches through `recordKey`. Keyed by the rid, which is
	// what both sides spell the parameter, because the record is rewritten in place.
	const record = /fn meta_path\([^)]*\) -> PathBuf \{([\s\S]*?)\n\}/.exec(source);
	expect(record, 'meta_path moved or changed shape in apps/cms').not.toBeNull();
	expect(record![1]).toContain('.join("meta").join(format!("{resource}.json"))');
});

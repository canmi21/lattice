import type { Fetcher, R2Bucket } from '@cloudflare/workers-types';

/**
 * Reading the bytes behind a key, from whichever store this deployment has.
 *
 * Production reads the R2 bucket that mirrors `data/public`; development reads `data/public`
 * itself, handed over by `wrangler dev --assets` because the local tree is the source of truth.
 * A worker cannot open that directory itself -- workerd's `node:fs` is virtual and cannot see
 * host paths (verified) -- so the runtime passes it in. Everything above this module works in
 * keys and knows nothing about which one answered.
 */

/**
 * Origin for asset-fetcher requests. `.invalid` is reserved by RFC 2606 to never resolve,
 * which is the point: the fetcher routes on the path and ignores the host, and a name that
 * cannot resolve makes it impossible for this to accidentally become a real request.
 */
const ASSET_ORIGIN = 'https://assets.invalid';

export type Bindings = {
	PUBLIC?: R2Bucket;
	/** Present only under `wrangler dev --assets`; see the dev task in mise.toml. */
	ASSETS?: Fetcher;
};

export type Found = {
	body: ReadableStream;
	contentType: string;
	etag?: string;
	/** What was served, when a range was asked for and satisfied. Absent for a whole object. */
	partial?: { offset: number; length: number; total: number };
};

/**
 * A range that names nothing inside the object.
 *
 * Its own result rather than a null, because the two mean opposite things to a caller: a missing
 * object is 404 and a range past the end of a present one is 416, and 416 has to report the size
 * so the client can ask again. Answering 404 for the second would send a browser looking for a
 * file it already found.
 */
export type Unsatisfiable = { unsatisfiable: true; total: number };

export function isUnsatisfiable(value: Found | Unsatisfiable | null): value is Unsatisfiable {
	return value !== null && 'unsatisfiable' in value;
}

/**
 * Read an object, or the part of one a `Range` header asks for.
 *
 * `range` is the header verbatim, parsed here in the one place with a grammar to obey -- see
 * spec/architecture/data.md, "Assets are addressed by their content", for why the worker
 * resolves it rather than the bucket, and what an unparseable or multipart request gets instead.
 */
export async function read(env: Bindings, key: string): Promise<Found | null>;
export async function read(
	env: Bindings,
	key: string,
	range: string | null | undefined,
): Promise<Found | Unsatisfiable | null>;
export async function read(
	env: Bindings,
	key: string,
	range?: string | null,
): Promise<Found | Unsatisfiable | null> {
	const wanted = range ? parseRange(range) : null;
	if (env.PUBLIC) return readFromBucket(env.PUBLIC, key, wanted);
	if (env.ASSETS) return readFromAssets(env.ASSETS, key, wanted);
	throw new Error('no store bound: expected PUBLIC in production or ASSETS under wrangler dev');
}

/** One range, in the two shapes the grammar allows, resolved against a size the reader knows. */
type Wanted = { offset: number; end: number | null } | { suffix: number };

/**
 * `bytes=a-b`, `bytes=a-` and `bytes=-n`, or null for anything else.
 *
 * Null covers a unit that is not `bytes`, a list of ranges, and a header that is simply
 * malformed. All three are served whole, which is what a recipient is allowed to do and what a
 * client asking for something this does not implement should get.
 */
function parseRange(header: string): Wanted | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, from, to] = match;
	// `bytes=-` names neither a start nor a length and is malformed. `bytes=-0` is well formed
	// and asks for the last zero bytes, which is a range naming no byte -- `resolve` says so,
	// once it knows the size, and the answer is 416 rather than an empty 206.
	if (from === '') return to === '' ? null : { suffix: Number(to) };
	const offset = Number(from);
	if (to === '') return { offset, end: null };
	const end = Number(to);
	// Backwards is malformed rather than empty, and is served whole for the same reason.
	return end < offset ? null : { offset, end };
}

/** Resolve a wanted range against the object's real size. */
function resolve(wanted: Wanted, total: number): { offset: number; length: number } | null {
	if ('suffix' in wanted) {
		const length = Math.min(wanted.suffix, total);
		return length === 0 ? null : { offset: total - length, length };
	}
	if (wanted.offset >= total) return null;
	const end = wanted.end === null ? total - 1 : Math.min(wanted.end, total - 1);
	return { offset: wanted.offset, length: end - wanted.offset + 1 };
}

async function readFromBucket(
	bucket: R2Bucket,
	key: string,
	wanted: Wanted | null,
): Promise<Found | Unsatisfiable | null> {
	if (!wanted) {
		const object = await bucket.get(key);
		if (!object?.body) return null;
		return {
			body: object.body,
			contentType: object.httpMetadata?.contentType ?? contentTypeFor(key),
			etag: object.httpEtag,
		};
	}

	// Two reads rather than one, and the first is a head: R2 resolves a range itself, but a range
	// past the end of an object is a 416 that has to report the size, and only the head knows it.
	// A head costs no bytes.
	const head = await bucket.head(key);
	if (!head) return null;
	const resolved = resolve(wanted, head.size);
	if (!resolved) return { unsatisfiable: true, total: head.size };

	const object = await bucket.get(key, { range: resolved });
	if (!object?.body) return null;
	return {
		body: object.body,
		contentType: object.httpMetadata?.contentType ?? contentTypeFor(key),
		etag: object.httpEtag,
		partial: { ...resolved, total: head.size },
	};
}

async function readFromAssets(
	assets: Fetcher,
	key: string,
	wanted: Wanted | null,
): Promise<Found | Unsatisfiable | null> {
	// The host is ignored by the assets fetcher; only the path matters.
	const response = await assets.fetch(`${ASSET_ORIGIN}/${key}`);
	if (!response.ok || !response.body) return null;
	const contentType = response.headers.get('content-type') ?? contentTypeFor(key);
	// No validator, deliberately. Measured: wrangler's asset fetcher sends no ETag of its own,
	// and synthesising one here would let a browser hold a file that is being edited on disk.
	// Development should always answer with what the tree currently says.
	if (!wanted) return { body: response.body, contentType };

	// Sliced here rather than asked for, because the asset fetcher serves whole files and this
	// path only exists under `wrangler dev`. The bytes are already local and the point is that
	// development answers a ranged request exactly as production does, not that it saves a read.
	const whole = new Uint8Array(await response.arrayBuffer());
	const resolved = resolve(wanted, whole.byteLength);
	if (!resolved) return { unsatisfiable: true, total: whole.byteLength };
	const part = whole.subarray(resolved.offset, resolved.offset + resolved.length);
	return {
		body: new Response(part).body as ReadableStream,
		contentType,
		partial: { ...resolved, total: whole.byteLength },
	};
}

/**
 * The first key under `prefix`, or null.
 *
 * Used where the extension is not known ahead of time: a favicon is stored as whatever format
 * the site served, so the lookup is by directory rather than by exact name.
 *
 * The assets fetcher cannot list, so development probes the formats the CMS is able to write.
 * That list is short and closed -- see `extension_for` in apps/cms -- and a format missing
 * from it could not have been stored in the first place.
 */
export async function findOne(env: Bindings, prefix: string): Promise<string | null> {
	if (env.PUBLIC) {
		const listed = await env.PUBLIC.list({ prefix, limit: 1 });
		return listed.objects[0]?.key ?? null;
	}
	if (env.ASSETS) {
		for (const extension of STORED_FORMATS) {
			const key = `${prefix}${extension}`;
			const response = await env.ASSETS.fetch(`${ASSET_ORIGIN}/${key}`);
			if (response.ok) return key;
		}
		return null;
	}
	throw new Error('no store bound: expected PUBLIC in production or ASSETS under wrangler dev');
}

/**
 * What a content id looks like.
 *
 * BLAKE3 truncated to 128 bits, hex encoded. Checked before a key is built from one, because an
 * id becomes a path segment and an unchecked one is a way to ask the bucket for something else.
 */
const CONTENT_ID = /^[0-9a-f]{32}$/;

export function isContentId(value: string): boolean {
	return CONTENT_ID.test(value);
}

/**
 * Where an object lives, by kind. The one declaration of the bucket's layout -- see
 * spec/architecture/data.md, "Assets are addressed by their content", for why it is a table.
 *
 * `fanned` is false only for `meta` (one record per asset, not per format); `extension` is
 * `null` only for `image`, whose request names the format. Never published -- a caller asks for
 * `{cid}.{ext}` and the split is put back on here; `OBJECTS` in apps/cms mirrors it, held
 * together by a test.
 */
export const OBJECTS = {
	captions: { fanned: true, extension: 'vtt' },
	image: { fanned: true, extension: null },
	license: { fanned: true, extension: 'txt' },
	meta: { fanned: false, extension: 'json' },
	video: { fanned: true, extension: 'mp4' },
} as const satisfies Record<string, { fanned: boolean; extension: string | null }>;

/** A kind of object the bucket holds, addressed by content id. */
export type ObjectPrefix = keyof typeof OBJECTS;

/** Every kind, for callers that have to cover all of them -- the CDN's routing, and its test. */
export const OBJECT_PREFIXES = Object.keys(OBJECTS) as ObjectPrefix[];

/**
 * The key one content-addressed object is stored under.
 *
 * `extension` is required for a kind that stores several formats and ignored for a kind that
 * stores one, which keeps the format out of every call site that could only ever pass the same
 * value. Asking for a format from a single-format kind is not an error worth a type: the answer
 * is the same either way and the table is what decides it.
 */
export function objectKey(prefix: ObjectPrefix, cid: string, extension?: string): string {
	const kind = OBJECTS[prefix];
	const suffix = kind.extension ?? extension;
	if (!suffix) {
		throw new Error(`${prefix} stores several formats: name one`);
	}
	const path = kind.fanned ? `${cid.slice(0, 2)}/${cid.slice(2, 4)}/${cid}` : cid;
	return `${prefix}/${path}.${suffix}`;
}


/**
 * Every extension apps/cms will write an icon under, in the order a lookup should try them.
 *
 * Mirrors `ICON_EXTENSIONS` in apps/cms. `jpeg`, not `jpg`: the two name one format, and this
 * repository writes the long spelling everywhere so its own links never take the redirect the CDN
 * keeps for a hand-typed short one. A test holds the two lists together.
 */
export const STORED_FORMATS = ['svg', 'png', 'jpeg', 'ico'] as const;

/**
 * A stored object as an HTTP response, with ETag only when the store supplied one.
 *
 * `Accept-Ranges` on every one of them, because every object here is served through a route that
 * can answer a range -- a player seeking, a `<video>` element probing for duration, a resumed
 * download. The header is what tells a client it may ask; without it a browser fetches whole
 * files to read a byte near the end of them.
 */
export function toResponse(found: Found): Response {
	const headers = new Headers({ 'Content-Type': found.contentType, 'Accept-Ranges': 'bytes' });
	if (found.etag) headers.set('ETag', found.etag);
	if (!found.partial) return new Response(found.body, { headers });

	const { offset, length, total } = found.partial;
	headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${total}`);
	headers.set('Content-Length', String(length));
	return new Response(found.body, { status: 206, headers });
}

/**
 * The answer to a range that names nothing inside the object.
 *
 * 416 carries the size so the client can ask again knowing it, which is the whole reason this is
 * not a 404: the object is there, the question was wrong.
 */
export function unsatisfiableResponse(total: number): Response {
	return new Response(null, {
		status: 416,
		headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
	});
}

/**
 * Content type from the key, for objects stored without one.
 *
 * R2 keeps whatever `httpMetadata` was set at upload, and rclone does set it, but an object
 * put by hand through the dashboard has none. Serving those as `application/octet-stream`
 * makes a browser download a favicon instead of drawing it.
 */
export function contentTypeFor(key: string): string {
	const extension = key.split('.').pop()?.toLowerCase() ?? '';
	switch (extension) {
		case 'svg':
			return 'image/svg+xml';
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'ico':
			return 'image/x-icon';
		case 'mp4':
			return 'video/mp4';
		case 'vtt':
			return 'text/vtt';
		case 'woff2':
			return 'font/woff2';
		case 'json':
			return 'application/json';
		case 'txt':
			return 'text/plain; charset=utf-8';
		default:
			return 'application/octet-stream';
	}
}

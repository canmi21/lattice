import { UNCHANGING } from '@canmi/cache';
import { Hono } from 'hono';
import {
	isUnsatisfiable,
	storageKey,
	read,
	toResponse,
	unsatisfiableResponse,
	type Bindings,
} from '@canmi/store';
import { canonicalSpelling, parseName, validatorFor } from './key';
import { DECODABLE, MEDIA_TYPES, type Decodable, isEncodable, transcode } from './transcode';
import { failure } from './respond';

/**
 * Serving content-addressed assets.
 *
 * A direct key lookup when the stored object is already the format asked for; otherwise the
 * stored object is decoded and re-encoded in this worker. The extension is the whole request:
 * there is no size parameter, so only sizes that were actually derived exist, and no caller
 * can invent dimensions to burn CPU on. See spec/architecture/delivery.md.
 */
const image = new Hono<{ Bindings: Bindings }>();

image.get('/:name', async (c) => {
	const parsed = parseName(c.req.param('name'));
	if (!parsed) {
		return failure(c, 400, 'not_a_content_id');
	}
	const { cid, extension } = parsed;

	// Normalised before anything else looks at the extension, so nothing downstream has to know
	// the alternative spelling exists.
	const canonical = canonicalSpelling(extension);
	if (canonical) {
		if (!(await findStored(c.env, cid))) {
			return failure(c, 404, 'not_found');
		}
		return c.redirect(`/image/${cid}.${canonical}`, 301);
	}

	// Answered before the bucket is touched. The id is a hash of the bytes, so a client
	// holding this tag holds these bytes; nothing on the far side could change that, and
	// reading the object to confirm it would only prove what the URL already stated.
	const tag = validatorFor(cid, extension);
	if (c.req.header('If-None-Match') === tag) {
		return new Response(null, { status: 304, headers: { ETag: tag } });
	}

	// A flat-colour original is stored as PNG rather than AVIF, so either may be a direct hit
	// and neither can be assumed to be the stored one.
	const stored = await read(c.env, storageKey(cid, extension), c.req.header('Range'));
	if (isUnsatisfiable(stored)) {
		return unsatisfiableResponse(stored.total);
	}
	if (stored) {
		return finish(toResponse(stored), cid, extension);
	}

	if (!isEncodable(extension)) {
		return failure(c, 404, 'not_found');
	}

	const cache = caches.default;
	const cached = await cache.match(c.req.raw);
	if (cached) {
		return cached;
	}

	const source = await findStored(c.env, cid);
	if (!source) {
		return failure(c, 404, 'not_found');
	}

	const bytes = await transcode(await source.bytes, source.format, extension);
	const response = finish(
		new Response(bytes, { headers: { 'Content-Type': MEDIA_TYPES[extension] } }),
		cid,
		extension,
	);
	// Held at the edge so the decode is paid once per colo rather than once per reader. The
	// response is immutable, so there is nothing for a stale entry to be wrong about.
	c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()));
	return response;
});

/**
 * The stored object for an id, in whichever format it was published as.
 *
 * Probed rather than assumed. Most assets are AVIF, but a flat-colour screenshot is stored as
 * PNG because lossy coding is the wrong tool for it, and asking for the AVIF that was never
 * written is how those became a 404 instead of a conversion.
 */
async function findStored(
	env: Bindings,
	cid: string,
): Promise<{ bytes: Promise<ArrayBuffer>; format: Decodable } | null> {
	for (const format of DECODABLE) {
		const found = await read(env, storageKey(cid, format));
		if (found) {
			return { bytes: new Response(found.body).arrayBuffer(), format };
		}
	}
	return null;
}

/** Give a response the validator and lifetime that content addressing earns it. */
function finish(response: Response, cid: string, extension: string): Response {
	if (!response.ok) return response;
	const headers = new Headers(response.headers);
	// Overwritten rather than deferred to: R2 supplies its own ETag for the stored object,
	// which would answer a `.webp` request with the AVIF object's tag and disagree with what
	// the 304 path compares against.
	headers.set('ETag', validatorFor(cid, extension));
	headers.set('Cache-Control', UNCHANGING);
	return new Response(response.body, { status: response.status, headers });
}

export default image;

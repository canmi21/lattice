import { Hono, type Context } from 'hono';
import {
	isUnsatisfiable,
	measure,
	read,
	storageKey,
	toResponse,
	unsatisfiableResponse,
	type Bindings,
	type Found,
	type Measured,
} from '@canmi/store';
import { parseName, validatorFor } from './key';
import { failure } from './respond';

/**
 * Naming an object by its id alone, under no type at all.
 *
 * A pure lookup and nothing else: the id and the extension form the storage key, the bytes go
 * back. Nothing is resolved, nothing is synthesised, and nothing is fetched -- which is what
 * makes this the one address the rest of the worker can call rather than request. See
 * spec/architecture/data.md, "The bucket stores content ids; the CDN serves types".
 */
const object = new Hono<{ Bindings: Bindings }>();

/** An extension as a key may carry one. Empty or punctuated is a name no object could have. */
const EXTENSION = /^[a-z0-9]+$/;

/**
 * The lookup this route performs, as something anything in this worker may call.
 *
 * `/derive` is told the full source name, so it calls this instead of fetching our own hostname:
 * a self-subrequest counts against the subrequest budget and invites a loop, and the semantics
 * are identical without it.
 */
export function findObject(env: Bindings, cid: string, extension: string): Promise<Found | null> {
	return read(env, storageKey(cid, extension));
}

/**
 * The same lookup asking only what a head reports: whether the object is there, how large it is,
 * and when it arrived. Null is absent. See `findObject`.
 */
export function measureObject(
	env: Bindings,
	cid: string,
	extension: string,
): Promise<Measured | null> {
	return measure(env, storageKey(cid, extension));
}

/** Whether a string is spelled the way an object's extension is. */
export function isExtension(value: string): boolean {
	return EXTENSION.test(value);
}

/**
 * Hand back the object an id and an extension name, ranges and validator included.
 *
 * A function rather than the body of the route below because the lookup is the interesting half
 * and the routing is not: one place holds the range and the 304 handling, which is how neither
 * of them ends up answering a seek with the whole file.
 */
export async function serveObject(
	c: Context<{ Bindings: Bindings }>,
	cid: string,
	extension: string,
): Promise<Response> {
	// Answered before the bucket is touched: the id is a hash of the bytes, so a client holding
	// this tag holds these bytes, and reading the object to confirm it would only prove what the
	// URL already stated. The tag is free here for the same reason -- the hash is the identity.
	const tag = validatorFor(cid, extension);
	if (c.req.header('If-None-Match') === tag) {
		return new Response(null, { status: 304, headers: { ETag: tag } });
	}

	const found = await read(c.env, storageKey(cid, extension), c.req.header('Range'));
	if (!found) {
		return failure(c, 404, 'not_found');
	}
	// The object is there and the question was wrong, which is a different answer from 404:
	// 416 carries the size so the client can ask again knowing it.
	if (isUnsatisfiable(found)) {
		return unsatisfiableResponse(found.total);
	}

	const response = toResponse(found);
	const headers = new Headers(response.headers);
	// Overwritten rather than deferred to, so the tag agrees with what the 304 above compares
	// against instead of with whatever R2 supplies for the stored object.
	headers.set('ETag', tag);
	// `Accept-Ranges`, `Content-Range` and the 206 come from `toResponse`, which is where
	// every object in this worker gets them. A clip is the reason they matter: a player seeks
	// by asking for a byte range, and without them a browser fetches the whole rung to start
	// in the middle of it.
	return new Response(response.body, { status: response.status, headers });
}

object.get('/:name', async (c) => {
	const parsed = parseName(c.req.param('name'));
	if (!parsed || !isExtension(parsed.extension)) {
		return failure(c, 400, 'not_a_content_id');
	}
	return serveObject(c, parsed.cid, parsed.extension);
});

export default object;

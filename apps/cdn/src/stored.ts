import { Hono } from 'hono';
import {
	isUnsatisfiable,
	objectKey,
	read,
	toResponse,
	unsatisfiableResponse,
	type Bindings,
	type ObjectPrefix,
} from '@canmi/store';
import { FOREVER } from './cache';
import { parseName, validatorFor } from './key';

/**
 * Serving a content-addressed kind that stores one format and needs nothing done to it.
 *
 * `video` and `captions` are both this: the key is put together from `OBJECTS` and the bytes
 * go back as they are -- a rung was already encoded by `cms video` at the size the ladder
 * chose, and a caption track is the one format a `<track>` element takes.
 *
 * A factory rather than two files, so the same five lines cannot drift apart between them.
 * `image` and `license` keep routes of their own because each does something more.
 */
export function stored(prefix: ObjectPrefix, extension: string) {
	const route = new Hono<{ Bindings: Bindings }>();

	route.get('/:name', async (c) => {
		const parsed = parseName(c.req.param('name'));
		if (!parsed || parsed.extension !== extension) {
			return c.json({ error: 'not a content id' }, 400);
		}
		const { cid } = parsed;

		// Answered before the bucket is touched, exactly as the image and licence routes do: the
		// id is a hash of the bytes, so a client holding this tag holds these bytes, and reading
		// the object to confirm it would only prove what the URL already stated.
		const tag = validatorFor(cid, extension);
		if (c.req.header('If-None-Match') === tag) {
			return new Response(null, { status: 304, headers: { ETag: tag } });
		}

		const found = await read(c.env, objectKey(prefix, cid), c.req.header('Range'));
		if (!found) {
			return c.json({ error: 'not found' }, 404);
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
		headers.set('Cache-Control', FOREVER);
		// `Accept-Ranges`, `Content-Range` and the 206 come from `toResponse`, which is where
		// every object in this worker gets them. A clip is the reason they matter: a player seeks
		// by asking for a byte range, and without them a browser fetches the whole rung to start
		// in the middle of it.
		return new Response(response.body, { status: response.status, headers });
	});

	return route;
}

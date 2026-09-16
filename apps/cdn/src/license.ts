import { Hono } from 'hono';
import {
	isUnsatisfiable,
	objectKey,
	read,
	toResponse,
	unsatisfiableResponse,
	type Bindings,
} from '@canmi/store';
import { FOREVER } from './cache';
import { parseName, validatorFor } from './key';

/**
 * Serving the licence texts `cms licenses` publishes.
 *
 * The same shape as the image route and for the same reason: a caller names the object by its
 * content id alone, and the fanned-out key it is stored under is put together here -- see
 * spec/architecture/data.md, "Assets are addressed by their content", for why the bucket's
 * layout must not leak into a link.
 *
 * Nothing is transcoded -- a licence is bytes served exactly as the package shipped them.
 */
const license = new Hono<{ Bindings: Bindings }>();

/** The one object here that is named rather than addressed by its content. */
const FULL = 'full.txt';

license.get('/:name', async (c) => {
	const name = c.req.param('name');

	if (name === FULL) {
		const found = await read(c.env, `license/${FULL}`, c.req.header('Range'));
		if (isUnsatisfiable(found)) return unsatisfiableResponse(found.total);
		// Left to the cache middleware rather than stamped: the aggregate is rewritten whenever
		// the dependency tree moves, so its name promises nothing about its bytes.
		return found ? toResponse(found) : c.json({ error: 'not found' }, 404);
	}

	const parsed = parseName(name);
	if (!parsed || parsed.extension !== 'txt') {
		return c.json({ error: 'not a content id' }, 400);
	}
	const { cid } = parsed;

	// Answered before the bucket is touched, exactly as the image route does: the id is a hash
	// of the bytes, so a client holding this tag holds these bytes.
	const tag = validatorFor(cid, 'txt');
	if (c.req.header('If-None-Match') === tag) {
		return new Response(null, { status: 304, headers: { ETag: tag } });
	}

	const stored = await read(c.env, objectKey('license', cid), c.req.header('Range'));
	if (!stored) {
		return c.json({ error: 'not found' }, 404);
	}
	if (isUnsatisfiable(stored)) {
		return unsatisfiableResponse(stored.total);
	}

	const response = toResponse(stored);
	const headers = new Headers(response.headers);
	// Overwritten rather than deferred to, so the tag agrees with what the 304 above compares
	// against instead of with whatever R2 supplies for the stored object.
	headers.set('ETag', tag);
	headers.set('Cache-Control', FOREVER);
	return new Response(response.body, { status: response.status, headers });
});

export default license;

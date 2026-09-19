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
import { parseName, validatorFor } from './key';
import { failure } from './respond';

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

license.get('/:name', async (c) => {
	const name = c.req.param('name');
	const parsed = parseName(name);
	if (!parsed || parsed.extension !== 'txt') {
		return failure(c, 400, 'not_a_content_id');
	}
	const { cid } = parsed;

	// Answered before the bucket is touched, exactly as the image route does: the id is a hash
	// of the bytes, so a client holding this tag holds these bytes.
	const tag = validatorFor(cid, 'txt');
	if (c.req.header('If-None-Match') === tag) {
		return new Response(null, { status: 304, headers: { ETag: tag } });
	}

	const stored = await read(c.env, storageKey(cid, 'txt'), c.req.header('Range'));
	if (!stored) {
		return failure(c, 404, 'not_found');
	}
	if (isUnsatisfiable(stored)) {
		return unsatisfiableResponse(stored.total);
	}

	const response = toResponse(stored);
	const headers = new Headers(response.headers);
	// Overwritten rather than deferred to, so the tag agrees with what the 304 above compares
	// against instead of with whatever R2 supplies for the stored object.
	headers.set('ETag', tag);
	headers.set('Cache-Control', UNCHANGING);
	return new Response(response.body, { status: response.status, headers });
});

export default license;

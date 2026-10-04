import { isResourceId } from '@monoflake/sdk/artifacts';
import { PUBLISHED } from '@monoflake/sdk/cache';
import { read, recordKey } from '@monoflake/sdk/store';
import { Hono } from 'hono';
import type { Bindings } from '../bindings';
import { failure } from '../lib/respond';

/**
 * `GET /media?resource=` -- what is known about a resource.
 *
 * **Asked by resource id and never by a content id.** A cid names what the CDN serves; this
 * record says what the thing is, survives a re-derive and is rewritten in place, so it is asked
 * for by the id granted to the thing. See spec/architecture/resource.md, "Two ids".
 *
 * Reads through the same store as the CDN, so `mise run dev-site-api` answers from the local tree
 * without needing `--remote` to reach a bucket only production writes.
 */
const media = new Hono<{ Bindings: Bindings }>();

media.get('/media', async (c) => {
	const rid = (c.req.query('resource') ?? '').toLowerCase();
	if (!isResourceId(rid)) {
		return failure(c, 400, 'invalid_resource', {});
	}

	const found = await read(c.env, recordKey(rid));
	if (!found) {
		return failure(c, 404, 'no_such_resource', {});
	}

	const headers = new Headers({
		'Content-Type': 'application/json; charset=utf-8',
		// The record can be rewritten when an asset is re-derived, so unlike the assets
		// themselves this is not immutable and gets a short life instead.
		'Cache-Control': PUBLISHED,
	});
	if (found.etag) headers.set('ETag', found.etag);
	return new Response(found.body, { headers });
});

export default media;

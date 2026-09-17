import { isContentId, objectKey, read } from '@canmi/store';
import { Hono } from 'hono';
import type { Bindings } from './bindings';
import { failure } from './respond';

/**
 * `GET /media?cid=` -- what is known about an asset.
 *
 * The same id names bytes on the CDN and a record here, so one content id answers both
 * questions without translation between them. Written by `cms image`, published alongside the
 * variants, and read back verbatim -- one description of an asset, not two that can disagree.
 *
 * Reads through the same store as the CDN, so `mise run dev-api` answers from `data/public`
 * without needing `--remote` to reach a bucket only production writes.
 */
const image = new Hono<{ Bindings: Bindings }>();

image.get('/media', async (c) => {
	const cid = (c.req.query('cid') ?? '').toLowerCase();
	if (!isContentId(cid)) {
		return failure(c, 400, 'not_a_content_id', {});
	}

	const found = await read(c.env, objectKey('meta', cid));
	if (!found) {
		return failure(c, 404, 'not_found', {});
	}

	const headers = new Headers({
		'Content-Type': 'application/json; charset=utf-8',
		// The record can be rewritten when an asset is re-derived, so unlike the assets
		// themselves this is not immutable and gets a short life instead.
		'Cache-Control': 'public, max-age=300',
	});
	if (found.etag) headers.set('ETag', found.etag);
	return new Response(found.body, { headers });
});

export default image;

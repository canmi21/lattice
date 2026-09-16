import { isContentId, objectKey, read } from '@canmi/store';
import { Hono } from 'hono';
import type { Bindings } from './bindings';

/**
 * `GET /image/{cid}` -- what is known about an asset.
 *
 * The same id names bytes on the CDN and a record here, so one content id answers both
 * questions without translation between them. Written by `cms image`, published alongside the
 * variants, and read back verbatim -- one description of an asset, not two that can disagree.
 *
 * Reads through the same store as the CDN, so `mise run dev-api` answers from `data/public`
 * without needing `--remote` to reach a bucket only production writes.
 */
const image = new Hono<{ Bindings: Bindings }>();

image.get('/:cid', async (c) => {
	const cid = c.req.param('cid').toLowerCase();
	if (!isContentId(cid)) {
		return c.json({ error: 'not a content id' }, 400);
	}

	const found = await read(c.env, objectKey('meta', cid));
	if (!found) {
		return c.json({ error: 'not found' }, 404);
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

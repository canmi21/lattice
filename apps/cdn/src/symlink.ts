import { unwrap, type AssetAnswer } from '@canmi/artifacts';
import { isDevHost, pickUrls } from '@canmi/urls';
import { Hono } from 'hono';
import { failure } from './respond';

/**
 * A permanent name, answered with the object it currently means.
 *
 * The name is what a browser, a mail client or another of this site's pages can construct on its
 * own, and it never changes; what it stands for does, whenever the mark behind it is redrawn. So
 * the answer is a redirect rather than bytes, and a temporary one: this host promises where the
 * name lives, not what it points at. The target is `/object`, which promises the bytes.
 */
const symlink = new Hono();

/**
 * Resolving a name means asking the API, which is the one place a name can be looked up.
 *
 * A name with no extension is not one this site publishes, so the shape is held in the route
 * pattern and anything else falls to the catch-all rather than becoming a question upstream.
 *
 * No `Accept-Ranges` and no validator: a redirect has no body, so there is nothing to seek into
 * and nothing for a tag to identify. The object at the far end carries both.
 */
symlink.get('/:name{[a-z0-9][a-z0-9.-]*\\.[a-z0-9]+}', async (c) => {
	const name = c.req.param('name');
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));

	const asked = await fetch(`${urls.api}/asset?name=${encodeURIComponent(name)}`);
	// Not a name this site publishes, which is a fact about the corpus and true until the next
	// publication -- the same short life every other refusal here takes.
	if (asked.status === 404) return failure(c, 404, 'no_such_name');
	if (!asked.ok) return failure(c, 502, 'upstream_unavailable');

	const asset = unwrap<AssetAnswer>(await asked.json(), asked.url);
	return c.redirect(`/object/${asset.cid}.${asset.extension}`, 302);
});

export default symlink;

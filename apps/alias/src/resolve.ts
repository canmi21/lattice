import { unwrap, type AssetAnswer } from '@canmi/artifacts';
import { pickUrls, isDevHost } from '@canmi/urls';
import type { Context } from 'hono';
import { NEVER, RESOLVED } from './cache';
import { redirectFor } from './redirect';
import { failure } from './respond';

/**
 * Turning one fixed name into the object it currently stands for.
 *
 * The API is asked, never a bucket: this layer holds nothing, and the one place a name can be
 * looked up is the worker that owns the records. One name, since the list of candidates was
 * another site's icon asking for a tone, and an icon is a resource now -- see
 * spec/architecture/resource.md, "The catalogue".
 */
export async function resolve(c: Context, name: string): Promise<Response> {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));

	const asked = await fetch(`${urls.api}/asset?name=${encodeURIComponent(name)}`);
	// Not a fact about the corpus but about this moment -- held for five minutes it would be an
	// outage rather than a blip.
	if (asked.status !== 404 && !asked.ok) {
		const refused = failure(c, 502, 'upstream_unavailable');
		refused.headers.set('Cache-Control', NEVER);
		return refused;
	}
	// Not a name this site publishes, which is a fact about the corpus and takes the corpus
	// lifetime -- `failure` stamps it, the same life every other miss here gets.
	if (asked.status === 404) return failure(c, 404, 'no_such_name');

	const asset = unwrap<AssetAnswer>(await asked.json(), asked.url);
	// The id alone, under no type: `/object` is the whole of content addressing on that host
	// and the only address there that promises bytes. What kind of thing this is stays in the
	// record, where a reader can ask for it. See spec/architecture/delivery.md.
	const target = `${urls.cdn}/object/${asset.cid}.${asset.extension}`;
	const query = new URL(c.req.url).search;
	const answer = c.redirect(target, redirectFor(c.req.method, query));
	answer.headers.set('Cache-Control', RESOLVED);
	return answer;
}

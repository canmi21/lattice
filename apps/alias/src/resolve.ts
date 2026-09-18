import { unwrap, type AssetAnswer } from '@canmi/artifacts';
import { pickUrls, isDevHost } from '@canmi/urls';
import type { Context } from 'hono';
import { redirectFor } from './redirect';
import { failure } from './respond';

/**
 * Turning one fixed name into the object it currently stands for.
 *
 * The API is asked, never a bucket: this layer holds nothing, and the one place a name can be
 * looked up is the worker that owns the records. That makes this the most fragile of the three
 * hosts, which is why nothing on the site's own rendering path goes through it.
 */
export async function resolve(c: Context, name: string): Promise<Response> {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	const asked = await fetch(`${urls.api}/asset?name=${encodeURIComponent(name)}`);
	if (!asked.ok) {
		// The name is not one this site publishes, which is a fact about the corpus and worth
		// five minutes -- the same life every other miss here gets.
		return failure(c, asked.status === 404 ? 404 : 502, 'no_such_name');
	}

	const asset = unwrap<AssetAnswer>(await asked.json(), asked.url);
	const target = `${urls.cdn}/${asset.type}/${asset.cid}.${asset.extension}`;
	const query = new URL(c.req.url).search;
	return c.redirect(target, redirectFor(c.req.method, query));
}

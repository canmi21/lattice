import { unwrap, type AssetAnswer } from '@canmi/artifacts';
import { pickUrls, isDevHost } from '@canmi/urls';
import type { Context } from 'hono';
import { NEVER, RESOLVED } from './cache';
import { redirectFor } from './redirect';
import { failure } from './respond';

/**
 * Which tone a request will settle for, in order.
 *
 * Naming one means that tone or nothing: a caller that asked for dark and received light has no
 * way to know it happened, and would draw a light icon on a dark surface believing it had the
 * right one. A 404 hands the choice back. With no tone named, either will do.
 */
export function tonesFor(tone: string | undefined): readonly string[] {
	return tone === 'dark' || tone === 'light' ? [tone] : ['light', 'dark'];
}

/**
 * Turning one fixed name into the object it currently stands for.
 *
 * The API is asked, never a bucket: this layer holds nothing, and the one place a name can be
 * looked up is the worker that owns the records. That makes this the most fragile of the three
 * hosts, which is why nothing on the site's own rendering path goes through it.
 */
export async function resolve(c: Context, names: readonly string[]): Promise<Response> {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));

	// Tried in order, and the order is the caller's meaning rather than a preference. Asking for
	// a dark icon and being handed a light one is a substitution the caller cannot detect, so a
	// named tone is one candidate and no tone is two.
	for (const name of names) {
		const asked = await fetch(`${urls.api}/asset?name=${encodeURIComponent(name)}`);
		if (asked.status === 404) continue;
		// Not a fact about the corpus but about this moment, and every icon on a page comes
		// through here -- held for five minutes it would be an outage rather than a blip.
		if (!asked.ok) {
			const refused = failure(c, 502, 'upstream_unavailable');
			refused.headers.set('Cache-Control', NEVER);
			return refused;
		}

		const asset = unwrap<AssetAnswer>(await asked.json(), asked.url);
		const target = `${urls.cdn}/${asset.type}/${asset.cid}.${asset.extension}`;
		const query = new URL(c.req.url).search;
		const answer = c.redirect(target, redirectFor(c.req.method, query));
		answer.headers.set('Cache-Control', RESOLVED);
		return answer;
	}

	// Not a name this site publishes, which is a fact about the corpus and takes the corpus
	// lifetime -- `failure` stamps it, the same life every other miss here gets.
	return failure(c, 404, 'no_such_name');
}

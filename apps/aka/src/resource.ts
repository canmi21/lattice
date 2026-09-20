import type { Context } from 'hono';
import { CANONICAL_PATTERN, expandCanonical } from '@canmi/artifacts';
import { isDevHost, pickUrls } from '@canmi/urls';
import { NEVER, RESOLVED } from './cache';
import { redirectFor } from './redirect';
import { failure } from './respond';

/** The one field of a record this layer reads. Everything else about it belongs to its reader. */
type Declared = { canonical?: unknown };

/**
 * A bare resource id, answered with whatever that resource says it canonically is.
 *
 * The record is the authority and this layer keeps none of it: the API is asked, the `canonical`
 * field is expanded against `libs/urls`, and the caller is sent there. See
 * spec/architecture/resource.md for the two ids, spec/architecture/delivery.md for the ladder.
 */
export async function resource(c: Context, rid: string): Promise<Response> {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));

	// `/media` answers with the record itself rather than with an envelope, the record being a
	// document with its own version on it already. See apps/api/src/image.ts.
	const asked = await fetch(`${urls.api}/media?rid=${encodeURIComponent(rid)}`);
	if (asked.status === 404) return failure(c, 404, 'no_such_resource');
	// A fact about this moment rather than about the corpus, so it is not held at all -- the same
	// asymmetry every other refusal on this host is measured against. See ./cache.ts.
	if (!asked.ok) {
		const refused = failure(c, 502, 'upstream_unavailable');
		refused.headers.set('Cache-Control', NEVER);
		return refused;
	}

	const record = (await asked.json()) as Declared;
	// Checked against the pattern before it is expanded, and not because the writer is untrusted:
	// the record arrives over the network, the value becomes the path of a redirect this layer
	// issues, and `expandCanonical` reads a prefix rather than validating. See libs/artifacts.
	const declared = typeof record.canonical === 'string' ? record.canonical : '';
	const canonical = CANONICAL_PATTERN.test(declared) ? expandCanonical(declared, urls) : undefined;
	// A resource declaring no canonical form has no address to be sent to, and choosing one from
	// its variants would be this layer inventing what the record was supposed to say.
	if (!canonical) return failure(c, 404, 'no_canonical_form');

	const answer = c.redirect(canonical, redirectFor(c.req.method, new URL(c.req.url).search));
	answer.headers.set('Cache-Control', RESOLVED);
	return answer;
}

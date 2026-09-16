/**
 * Serving the published corpus: a compiled view, an article's source, a locale's feed, llms.txt.
 *
 * The path is the key -- `/{type}/{hash}.{ext}` is exactly what the bucket holds -- so nothing
 * here builds one, and nothing here stamps a lifetime either: the policy falls out of the shape
 * of the name in `cache.ts`, which is what addressing them this way was for.
 *
 * The site's Worker fetches these and, after hydration, so does the reader's browser. That
 * second consumer is what the `*` on this worker's CORS is for, and why it has to stay a `*`:
 * an allowlist would put `Vary: Origin` on a year-long entry and split it per origin. See
 * spec/architecture/artifacts.md.
 */

import { parseArtifactKey, type ArtifactType } from '@canmi/artifacts';
import {
	isUnsatisfiable,
	read,
	toResponse,
	unsatisfiableResponse,
	type Bindings,
} from '@canmi/store';
import { Hono } from 'hono';
import { validatorFor } from './key';

/**
 * What each type is served as. Keyed by `ArtifactType`, so adding one without an answer is a
 * compile error rather than a download prompt: R2 carries whatever `httpMetadata` rclone set,
 * which is right for JSON and absent for the rest.
 */
const TYPES: Record<ArtifactType, string> = {
	content: 'application/json',
	page: 'application/json',
	markdown: 'text/markdown; charset=utf-8',
	feed: 'application/atom+xml; charset=utf-8',
	llms: 'text/plain; charset=utf-8',
};

export function artifact(type: ArtifactType) {
	const route = new Hono<{ Bindings: Bindings }>();

	route.get('/:name', async (c) => {
		const key = `${type}/${c.req.param('name')}`;
		// Strict rather than lenient about the type and the extension agreeing: a segment that is
		// decorative in one place and load-bearing in another is eventually parsed by accident.
		const parsed = parseArtifactKey(key);
		if (!parsed) {
			return c.json({ error: 'not an artifact' }, 400);
		}

		// Answered before the bucket is touched, exactly as the image and licence routes do: the
		// name is a hash of the bytes, so a client holding this tag holds these bytes.
		const tag = validatorFor(parsed.hash, parsed.ext);
		if (c.req.header('If-None-Match') === tag) {
			return new Response(null, { status: 304, headers: { ETag: tag } });
		}

		const found = await read(c.env, key, c.req.header('Range'));
		if (!found) {
			return c.json({ error: 'not found' }, 404);
		}
		if (isUnsatisfiable(found)) {
			return unsatisfiableResponse(found.total);
		}

		const response = toResponse(found);
		const headers = new Headers(response.headers);
		headers.set('Content-Type', TYPES[type]);
		// Overwritten rather than deferred to, so the tag agrees with what the 304 above compares
		// against instead of with whatever R2 supplies for the stored object.
		headers.set('ETag', tag);
		return new Response(response.body, { status: response.status, headers });
	});

	return route;
}

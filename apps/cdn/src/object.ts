import { Hono } from 'hono';
import { read, sizeOf, storageKey, type Bindings, type Found } from '@canmi/store';
import { objectCache } from './cache';
import { parseName } from './key';
import { serveObject } from './stored';
import { failure } from './respond';

/**
 * Naming an object by its id alone, under no type at all.
 *
 * A pure lookup and nothing else: the id and the extension form the storage key, the bytes go
 * back. Nothing is resolved, nothing is synthesised, and nothing is fetched -- which is what
 * makes this the one address the rest of the worker can call rather than request. The type in
 * `/{type}/{cid}.{ext}` is decorative in the lookup and is simply absent here; see
 * spec/architecture/data.md, "The bucket stores content ids; the CDN serves types".
 */
const object = new Hono<{ Bindings: Bindings }>();

/** An extension as a key may carry one. Empty or punctuated is a name no object could have. */
const EXTENSION = /^[a-z0-9]+$/;

/**
 * The lookup this route performs, as something anything in this worker may call.
 *
 * `/derive` is told the full source name, so it calls this instead of fetching our own hostname:
 * a self-subrequest counts against the subrequest budget and invites a loop, and the semantics
 * are identical without it.
 */
export function findObject(env: Bindings, cid: string, extension: string): Promise<Found | null> {
	return read(env, storageKey(cid, extension));
}

/** The same lookup asking only whether the object is there, and how large. See `findObject`. */
export function measureObject(
	env: Bindings,
	cid: string,
	extension: string,
): Promise<number | null> {
	return sizeOf(env, storageKey(cid, extension));
}

/** Whether a string is spelled the way an object's extension is. */
export function isExtension(value: string): boolean {
	return EXTENSION.test(value);
}

object.use('*', objectCache);

object.get('/:name', async (c) => {
	const parsed = parseName(c.req.param('name'));
	if (!parsed || !isExtension(parsed.extension)) {
		return failure(c, 400, 'not_a_content_id');
	}
	return serveObject(c, parsed.cid, parsed.extension);
});

export default object;

import {
	PUBLIC_TYPE_NAMES,
	isPublicType,
	typeCarries,
	typeForExtension,
	type PublicType,
} from '@canmi/artifacts';
import { isContentId } from '@canmi/store';
import type { MiddlewareHandler } from 'hono';
import { failure } from './respond';

/**
 * What this host will answer to at all, decided before any route sees the request.
 *
 * Everything here is content-addressed, so an address either parses as `/{type}/{cid}.{ext}` or it
 * is not an address this host can express. That distinction is the whole of the two codes: a `400`
 * says the shape is wrong and nothing could ever live there, a `404` says the shape is right and
 * the object is not in the bucket -- which is a real and temporary fact, because it means the
 * object was never uploaded or has been swept. See spec/architecture/delivery.md.
 */

/**
 * Names this host answers for that are not objects.
 *
 * `robots.txt` is a statement about this host and stays on it. `favicon.ico` is a permanent name
 * this host mounts like every other, redirecting to the layer that owns it. Nothing else may be a
 * single segment: it would be an address with no content id in it.
 */
export const ROOT_NAMES = new Set(['favicon.ico', 'robots.txt']);

/** Multi-segment prefixes whose keys are names rather than content ids, and why each still is. */
export const NAMED_PREFIXES = new Set([
	// A subset is promised rather than hashed -- see "There is one exception, and it carries a
	// promise" -- and the CJK chunks carry their own hash inside a family directory.
	'fonts',
	// Addressed by the slug of the page it belongs to, and by the domain it was collected from.
	// Both resolve to bytes that change on somebody else's schedule.
	'opengraph',
	'favicon',
	// Proxied from a release rather than stored here at all.
	'github',
]);

/**
 * The correction a mistyped type earns, or nothing when the address is already right.
 *
 * The content id is what identifies an object, so a wrong type still finds it -- which is exactly
 * why it is corrected rather than served: an address that resolves under any type is an address
 * with no canonical spelling. `json` names two types and is left alone, because guessing between a
 * compiled view and a standalone page would be inventing a fact the envelope already carries.
 */
export function correctionFor(type: PublicType, extension: string): PublicType | undefined {
	if (typeCarries(type, extension)) return undefined;
	return typeForExtension(extension);
}

export const addressable: MiddlewareHandler = async (c, next) => {
	const path = new URL(c.req.url).pathname.replace(/^\/+/, '');
	if (path === '') return next();

	const [head = '', rest, ...deeper] = path.split('/');

	// One segment: a name, and only the ones this host mounts. Anything else is malformed rather
	// than missing -- there is no object that could ever answer at a single segment.
	if (rest === undefined) {
		return ROOT_NAMES.has(head) ? next() : failure(c, 400, 'not_an_address');
	}

	if (NAMED_PREFIXES.has(head)) return next();
	if (!isPublicType(head)) return failure(c, 400, 'not_an_address');
	// A type takes exactly one segment after it, and that segment is the object's name.
	if (deeper.length > 0) return failure(c, 400, 'not_an_address');

	const dot = rest.lastIndexOf('.');
	const cid = dot > 0 ? rest.slice(0, dot).toLowerCase() : '';
	const extension = dot > 0 ? rest.slice(dot + 1).toLowerCase() : '';
	if (!isContentId(cid)) return failure(c, 400, 'not_a_content_id');

	const correction = correctionFor(head, extension);
	if (correction) return c.redirect(`/${correction}/${cid}.${extension}`, 301);
	// A type that carries nothing of this extension and no type that does: the address parses and
	// still names nothing, which is the same malformed answer.
	if (!typeCarries(head, extension)) return failure(c, 400, 'not_an_address');

	return next();
};

/** Every type, for the route table that has to cover all of them. */
export const TYPES = PUBLIC_TYPE_NAMES;

import { Hono } from 'hono';
import { isContentId, type Bindings } from '@canmi/store';
import { objectCache } from './cache';
import { findObject, isExtension, measureObject } from './object';
import { failure } from './respond';
import { MEDIA_TYPES, isDecodable, isDerivable, transcode } from './transcode';
import { zipOne } from './zip';

/**
 * Handing back a stored object as something else, named in full by the caller.
 *
 * `/derive/{cid}.{ext}.{ext}` is the source's extension and then the target's, so
 * `{cid}.avif.webp` is "the object stored as `{cid}.avif`, given to me as webp". It is
 * deliberately dumb: it never searches for the source the way `/image` probes for one, because
 * it was told which object it is, and it never reaches this host over the network to fetch it --
 * see `findObject`, which is the same lookup `/object` performs, called rather than requested.
 */
const derive = new Hono<{ Bindings: Bindings }>();

/**
 * How large a source this will package, and the number is a memory budget rather than a policy.
 *
 * An isolate gets 128 MB for its heap and its WebAssembly together, and it is reused across
 * requests, so a zip may land on one whose codec heap is already allocated. The archive is
 * streamed and adds nothing to that, but the cap is what keeps the refusal honest at the edges.
 */
const MAX_PACKAGED = 50 * 1024 * 1024;

/** The one target that is not an image format: the object as it is, in an archive. */
const PACKAGED = 'zip';

/** `{cid}.{from}.{to}`, or null for anything that is not exactly that. */
export function parseDerivation(name: string): { cid: string; from: string; to: string } | null {
	const [cid, from, to, ...rest] = name.toLowerCase().split('.');
	if (cid === undefined || from === undefined || to === undefined) return null;
	if (rest.length > 0) return null;
	if (!isContentId(cid) || !isExtension(from) || !isExtension(to)) return null;
	return { cid, from, to };
}

derive.use('*', objectCache);

derive.get('/:name', async (c) => {
	const parsed = parseDerivation(c.req.param('name'));
	if (!parsed) {
		return failure(c, 400, 'not_an_address');
	}
	const { cid, from, to } = parsed;

	// The source comes first, and this is a head rather than a read: whether the object is there
	// and how large it is are one question, and the package below has to answer on the size
	// before a byte is in memory. Absent is 404 -- never uploaded, or swept, which is a real and
	// temporary fact and the only thing separating a sweep from a typo.
	const size = await measureObject(c.env, cid, from);
	if (size === null) {
		return failure(c, 404, 'not_found');
	}

	// Nothing to derive, and the address already names where those bytes live. Permanent because
	// the redirect is a function of the input: these two extensions will always be one.
	if (from === to) {
		return c.redirect(`/object/${cid}.${from}`, 301);
	}

	if (isDerivable(to)) {
		// A target this worker can encode is still nothing without a source it can decode.
		if (!isDecodable(from)) {
			return failure(c, 400, 'not_derivable');
		}
		const source = await findObject(c.env, cid, from);
		if (!source) {
			return failure(c, 404, 'not_found');
		}
		const bytes = await transcode(await new Response(source.body).arrayBuffer(), from, to);
		return new Response(bytes, { headers: { 'Content-Type': MEDIA_TYPES[to] } });
	}

	if (to === PACKAGED) {
		if (size > MAX_PACKAGED) {
			return failure(c, 413, 'too_large_to_package');
		}
		const source = await findObject(c.env, cid, from);
		if (!source) {
			return failure(c, 404, 'not_found');
		}
		// Named inside the archive as the object is named outside it, so unpacking gives back
		// the file the address asked for rather than something called after this route.
		return new Response(zipOne(`${cid}.${from}`, size, source.body), {
			headers: { 'Content-Type': 'application/zip' },
		});
	}

	// A target nobody here can produce. The shape parsed and the source is there, and still
	// nothing could ever answer, which is the same malformed answer an unroutable address gets.
	return failure(c, 400, 'not_derivable');
});

export default derive;

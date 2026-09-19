import { Hono } from 'hono';
import { isContentId, rangedResponse, toResponse, type Bindings } from '@canmi/store';
import { findObject, isExtension, measureObject } from './object';
import { failure } from './respond';
import { MEDIA_TYPES, isDecodable, isDerivable, transcode } from './transcode';
import { zipOne, zipWhole } from './zip';

/**
 * Handing back a stored object as something else, named in full by the caller.
 *
 * `/derive/{cid}.{ext}.{ext}` is the source's extension and then the target's, so
 * `{cid}.avif.webp` is "the object stored as `{cid}.avif`, given to me as webp". It is
 * deliberately dumb: it never searches for a source, because it was told which object it is,
 * and it never reaches this host over the network to fetch it --
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

/**
 * The same cap halved, for a request that named a range, because that one cannot stream.
 *
 * A range is answered from the whole archive, which has to exist before a byte of it can be
 * chosen: the archive is one buffer of the source plus 120 bytes, and the slice handed to the
 * response is a second copy of at most the same size. So the peak is twice what is allowed
 * rather than nothing, and half of the streaming cap puts it back at the 50 MB that one passes.
 */
const MAX_SOUGHT = MAX_PACKAGED / 2;

/** The one target that is not an image format: the object as it is, in an archive. */
const PACKAGED = 'zip';

/**
 * The one spelling this host corrects, and it corrects it on the target alone.
 *
 * `.jpg` is JPEG written for an eight-character filename limit that outlived the system that
 * imposed it. Carried as a second format it would fragment the cache and the validators over
 * identical bytes, so a request naming it is answered with the canonical spelling and a reader's
 * browser never asks again. See spec/architecture/delivery.md.
 */
const SHORT_JPEG = 'jpg';
const JPEG = 'jpeg';

/** `{cid}.{from}.{to}`, or null for anything that is not exactly that. */
export function parseDerivation(name: string): { cid: string; from: string; to: string } | null {
	const [cid, from, to, ...rest] = name.toLowerCase().split('.');
	if (cid === undefined || from === undefined || to === undefined) return null;
	if (rest.length > 0) return null;
	if (!isContentId(cid) || !isExtension(from) || !isExtension(to)) return null;
	return { cid, from, to };
}

derive.get('/:name', async (c) => {
	const parsed = parseDerivation(c.req.param('name'));
	if (!parsed) {
		return failure(c, 400, 'not_an_address');
	}
	const { cid, from, to } = parsed;
	const range = c.req.header('Range');

	// The source comes first, and this is a head rather than a read: whether the object is there
	// and how large it is are one question, and the package below has to answer on the size
	// before a byte is in memory. Absent is 404 -- never uploaded, or swept, which is a real and
	// temporary fact and the only thing separating a sweep from a typo.
	const measured = await measureObject(c.env, cid, from);
	if (measured === null) {
		return failure(c, 404, 'not_found');
	}

	// The target alone, and never the source. A source spelled `jpg` is a key the bucket cannot
	// hold -- apps/cms names every JPEG it writes `jpeg` -- so it is already the 404 above, and
	// rewriting it here would read one object's bytes out from under a name nobody stored.
	if (to === SHORT_JPEG) {
		return c.redirect(`/derive/${cid}.${from}.${JPEG}`, 301);
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
		// The whole image, then the range out of it. Transcoding a slice would answer with bytes
		// that are not part of any image, and a client cannot tell that from the ones it asked for.
		return rangedResponse(new Uint8Array(bytes), MEDIA_TYPES[to], range);
	}

	if (to === PACKAGED) {
		if (measured.size > MAX_PACKAGED) {
			return failure(c, 413, 'too_large_to_package');
		}
		// A different refusal, because it is a different fact: this one would have been answered
		// whole. A client told the object is too large to package learns nothing it can act on,
		// where one told it is too large to seek into knows to ask again without the header.
		if (range && measured.size > MAX_SOUGHT) {
			return failure(c, 413, 'too_large_to_seek');
		}
		const source = await findObject(c.env, cid, from);
		if (!source) {
			return failure(c, 404, 'not_found');
		}
		// Named inside the archive as the object is named outside it, so unpacking gives back
		// the file the address asked for rather than something called after this route. The
		// timestamp is when those bytes were uploaded, which is the one true thing this has to
		// say about them -- `unzip -l` printed a fixed epoch before, which said nothing.
		const entry = { name: `${cid}.${from}`, size: measured.size, uploaded: measured.uploaded };
		if (!range) {
			return toResponse({ body: zipOne(entry, source.body), contentType: 'application/zip' });
		}
		return rangedResponse(await zipWhole(entry, source.body), 'application/zip', range);
	}

	// A target nobody here can produce. The shape parsed and the source is there, and still
	// nothing could ever answer, which is the same malformed answer an unroutable address gets.
	return failure(c, 400, 'not_derivable');
});

export default derive;

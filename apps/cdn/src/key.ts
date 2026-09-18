/**
 * Turning a request path into the object it names, and naming a response about it.
 *
 * Pure string handling, kept apart from the route so it can be read and tested without loading a
 * codec. The route pulls in several megabytes of WebAssembly; none of that is needed to know
 * which object a URL is asking for.
 *
 * Where an object *lives* is not here. That is a fact about the bucket and belongs to
 * `@canmi/store`, which is what reads it -- it was written out once per worker until three
 * copies had to agree about which prefixes fan out.
 */

import { isContentId } from '@canmi/store';

/** Split `{cid}.{ext}`, or null if it is not that shape. */
export function parseName(name: string): { cid: string; extension: string } | null {
	const dot = name.lastIndexOf('.');
	if (dot <= 0) return null;
	const cid = name.slice(0, dot).toLowerCase();
	const extension = name.slice(dot + 1).toLowerCase();
	return isContentId(cid) ? { cid, extension } : null;
}

/**
 * The spelling a request should have used, or `null` when it already has it.
 *
 * `jpg` normalises to `jpeg` at the door rather than downstream, because it is a fact about how
 * a name is written, not about what can be decoded -- see spec/architecture/delivery.md, "The
 * extension asks for a format", for why one spelling stays one.
 */
export function canonicalSpelling(extension: string): string | null {
	return extension === 'jpg' ? 'jpeg' : null;
}

/** One id serves several formats, so the format is part of what the tag identifies. */
export function validatorFor(cid: string, extension: string): string {
	return `"${cid}.${extension}"`;
}

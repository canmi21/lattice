/**
 * Which redirect a resolved name earns.
 *
 * This layer holds nothing. It answers "what does this name mean right now" and sends the caller
 * to the bytes, so every answer is temporary -- a permanent one would be a promise about bytes
 * this layer does not have and cannot keep.
 *
 * Temporary leaves two codes, and what picks between them is whether the request carried input.
 * A `302` lets a user agent turn the follow-up into a `GET`, which is only harmless when there was
 * nothing to carry. A request with a query or a body is a question whose answer depends on what
 * was asked, so it takes the `307` that preserves the method and the body verbatim. A path is not
 * input: it is the name being resolved. See spec/architecture/delivery.md.
 */
export const FOUND = 302;
export const PRESERVED = 307;

export function redirectFor(method: string, query: string): typeof FOUND | typeof PRESERVED {
	if (method !== 'GET' && method !== 'HEAD') return PRESERVED;
	return query === '' ? FOUND : PRESERVED;
}

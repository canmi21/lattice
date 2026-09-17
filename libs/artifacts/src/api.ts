/**
 * The shape every answer this API composes arrives in.
 *
 * One envelope for success and failure both, so a consumer asks whether the call worked before it
 * asks what it returned -- and asks it once, rather than at every call site. What the envelope
 * carries is not standardised: `data` is whatever that route answers with.
 */
export type ApiResponse<T> = { status: 'success'; data: T } | { status: 'error'; message: string };

/**
 * A union rather than the optional fields the Rust original has.
 *
 * Its `data` and `message` are both `Option`, which in TypeScript would be two optional keys and a
 * `status` string -- leaving every reader to prove that a success really has data. Discriminating
 * on `status` makes the compiler do that, and makes a third status a compile error at every use.
 */
export type ApiSuccess<T> = Extract<ApiResponse<T>, { status: 'success' }>;
export type ApiError = Extract<ApiResponse<never>, { status: 'error' }>;

/**
 * Read the envelope and hand back what is inside, or throw.
 *
 * The one place an answer is unwrapped. A route's own shape is checked by whoever asked for it,
 * on the value this returns -- which is the nesting: this function knows `status` and nothing
 * else, and the caller knows its own payload and nothing about transport.
 */
export function unwrap<T>(body: unknown, source: string): T {
	if (typeof body !== 'object' || body === null || !('status' in body)) {
		throw new Error(`${source} answered something that is not an API response`);
	}
	const envelope = body as ApiResponse<T>;
	if (envelope.status === 'error') {
		throw new Error(`${source} answered an error: ${envelope.message}`);
	}
	if (envelope.status !== 'success') {
		throw new Error(`${source} answered an unknown status`);
	}
	return envelope.data;
}

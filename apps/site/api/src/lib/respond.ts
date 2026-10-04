import { type ApiResponse, type Code, errorBody } from '@canmi/response';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * The two ways this API answers, so no route composes the envelope itself.
 *
 * Headers stay the caller's: what may cache an answer is a property of the route, not of whether it
 * succeeded. See platform's spec/architecture/artifacts.md, "The API is the only thing that
 * changes".
 */
type Headers = Record<string, string>;

/**
 * `status` is a parameter where the Rust original hardcodes 200, because a created subscription
 * really is a 201 and flattening it would change what the route means. Success is the envelope,
 * not the number.
 */
export function success<T>(
	c: Context,
	data: T,
	headers: Headers,
	status: ContentfulStatusCode = 200,
) {
	return c.json({ status: 'success', data } satisfies ApiResponse<T>, status, headers);
}

/**
 * A refusal: a code a caller switches on, and the code's own message unless `message` says more.
 * See platform's spec/architecture/services.md, "Every answer is one envelope".
 */
export function failure(
	c: Context,
	status: ContentfulStatusCode,
	code: Code,
	headers: Headers,
	message?: string,
) {
	return c.json(errorBody(code, message), status, headers);
}

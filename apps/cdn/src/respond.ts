import type { ApiResponse } from '@canmi/artifacts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * How this worker says no.
 *
 * A success here is the object's own bytes and is not wrapped -- an image is an image. Everything
 * else takes the envelope every API answer takes, so a caller reads one shape whichever of the
 * two workers refused it. See spec/architecture/artifacts.md and the workspace spec/json.md.
 */
export function failure(c: Context, status: ContentfulStatusCode, message: string) {
	return c.json({ status: 'error', message } satisfies ApiResponse<never>, status);
}

/**
 * The envelope lives in libs/response, beside its Rust half; these are its re-exports for the
 * readers that already take their contracts from here.
 */
import * as v from 'valibot';
import { unwrap } from '@canmi/response';

export { type ApiError, type ApiResponse, type ApiSuccess, unwrap } from '@canmi/response';

/**
 * Open the envelope, then check that what was inside is what this call asked for.
 *
 * Two steps and one function, because every caller wants both and wanted them in that order. The
 * envelope says whether the call worked; the schema says whether the payload is the shape the
 * route promised. Kept here rather than in each consumer so that valibot stays this library's
 * dependency and not everyone's. See spec/json.md.
 */
export function unwrapAs<S extends v.GenericSchema>(
	schema: S,
	body: unknown,
	source: string,
): v.InferOutput<S> {
	return v.parse(schema, unwrap<unknown>(body, source));
}

import { createHash } from 'node:crypto';
import {
	BatchRequestSchema,
	CancelAnswerSchema,
	EnvelopeSchema,
	LikeAnswerSchema,
	LikedAnswerSchema,
	NewsletterAnswerSchema,
	PageEnvelopeSchema,
	ReadAnswerSchema,
	ReadsAnswerSchema,
	ResourceSchema,
	StatsAnswerSchema,
} from '@monoflake/sdk/artifacts';
import type { Route } from './routes';

/**
 * What a route promises: the schemas its answer and its request are read by, and a revision for
 * whatever of its shape no schema describes. Bump `revision` when that part changes; a schema
 * change needs nothing, because the schema is hashed.
 */
export interface Contract {
	readonly schemas: readonly unknown[];
	readonly revision: number;
}

export const CONTRACTS: Readonly<Record<Route, Contract>> = {
	article: { schemas: [EnvelopeSchema], revision: 1 },
	asset: { schemas: [], revision: 1 },
	batch: { schemas: [BatchRequestSchema, ReadsAnswerSchema], revision: 1 },
	feed: { schemas: [], revision: 1 },
	homepage: { schemas: [PageEnvelopeSchema], revision: 1 },
	like: { schemas: [LikedAnswerSchema, LikeAnswerSchema], revision: 1 },
	media: { schemas: [ResourceSchema], revision: 1 },
	newsletter: { schemas: [NewsletterAnswerSchema, CancelAnswerSchema], revision: 1 },
	read: { schemas: [ReadAnswerSchema], revision: 1 },
	sitemap: { schemas: [], revision: 1 },
	source: { schemas: [], revision: 1 },
	stats: { schemas: [StatsAnswerSchema], revision: 1 },
	verify: { schemas: [], revision: 1 },
};

/**
 * A schema as data: every field that says what it accepts, in a fixed order, and none of the
 * functions that run it. Two schemas that accept the same shape read the same here, and changing
 * a field, a literal or a limit changes it.
 */
function canonical(value: unknown): unknown {
	if (value instanceof RegExp) return value.toString();
	if (Array.isArray(value)) return value.map(canonical);
	if (value === null || typeof value !== 'object')
		return typeof value === 'function' ? undefined : value;
	const fields = Object.entries(value)
		.filter(
			([key, field]) => !key.startsWith('~') && key !== 'message' && typeof field !== 'function',
		)
		.toSorted(([a], [b]) => a.localeCompare(b))
		.map(([key, field]) => [key, canonical(field)]);
	return Object.fromEntries(fields);
}

/** The address a route is asked at: its name and contract, hashed, so it moves only with them. */
export function addressOf(route: Route, contract: Contract): string {
	const text = JSON.stringify([route, contract.revision, canonical(contract.schemas)]);
	return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** Every route's address, as the site's build states it to its pages and its Worker alike. */
export function addresses(): Record<Route, string> {
	return Object.fromEntries(
		Object.entries(CONTRACTS).map(([route, contract]) => [
			route,
			addressOf(route as Route, contract),
		]),
	) as Record<Route, string>;
}

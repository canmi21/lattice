/**
 * What the engagement API answers, as schemas rather than as types.
 *
 * These are the answers a browser reads, and a browser is reading something it did not produce --
 * across a network, from a Worker deployed on its own schedule. A type says what should arrive; a
 * schema is the only thing that says what did. The corpus answers are checked by their envelope
 * instead, which is cheaper and is all a content-addressed object needs; nothing here is
 * content-addressed. See spec/architecture/artifacts.md, "Validation is heavy where it is free".
 *
 * Shared because both sides want the same sentence: the Worker builds an answer that satisfies
 * the inferred type, and the browser parses what arrives against the schema it was inferred from.
 */
import * as v from 'valibot';

/** A counter is a whole number and never negative, which is most of what can go wrong with one. */
const counter = v.pipe(v.number(), v.integer(), v.minValue(0));

/** A capability token as the API mints it: 128 bits, lowercase hex. */
const cancelToken = v.pipe(v.string(), v.regex(/^[0-9a-f]{32}$/));

/**
 * The two public counters, which belong to the site rather than to whoever is asking.
 *
 * Separate from `LikedAnswer` so that this one may be shared-cached and rendered on the server.
 * See spec/engagement.md.
 */
export const StatsAnswerSchema = v.object({
	subscriber_count: counter,
	like_count: counter,
});

/** Whether this visitor has liked. Per address, so never shared and never server-rendered. */
export const LikedAnswerSchema = v.object({ liked: v.boolean() });

/** Read counts by slug, for every slug asked for that names an article. */
export const ReadsAnswerSchema = v.object({ reads: v.record(v.string(), counter) });

/** What recording a visit answers with: the article, and the running total including it. */
export const ReadAnswerSchema = v.object({ slug: v.string(), read_count: counter });

/** Taking or giving back a like. */
export const LikeAnswerSchema = v.object({ liked: v.boolean(), like_count: counter });

/**
 * Subscribing, which answers with the token only the first time.
 *
 * A second subscription to an address already held answers without one, so that asking twice
 * never hands out a capability over an existing subscription. See spec/engagement.md.
 */
export const NewsletterAnswerSchema = v.object({
	email: v.string(),
	cancel_token: v.optional(cancelToken),
	subscriber_count: counter,
});

/** Cancelling. The count is absent when the answer is about a subscription that was not there. */
export const CancelAnswerSchema = v.object({
	cancelled: v.optional(v.boolean()),
	subscriber_count: v.optional(counter),
});

export type StatsAnswer = v.InferOutput<typeof StatsAnswerSchema>;
export type LikedAnswer = v.InferOutput<typeof LikedAnswerSchema>;
export type ReadsAnswer = v.InferOutput<typeof ReadsAnswerSchema>;
export type ReadAnswer = v.InferOutput<typeof ReadAnswerSchema>;
export type LikeAnswer = v.InferOutput<typeof LikeAnswerSchema>;
export type NewsletterAnswer = v.InferOutput<typeof NewsletterAnswerSchema>;
export type CancelAnswer = v.InferOutput<typeof CancelAnswerSchema>;

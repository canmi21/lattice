/**
 * The one batch entry point, and what may be asked through it.
 *
 * A single lookup is a `GET` with its identifiers in the query; asking about many things is a
 * `POST` carrying a list, because a list does not belong in a URL. That left the API growing one
 * route per batchable question -- `/views`, `/read-counts` -- each a second spelling of a question
 * already answered singly, and each needing its own name.
 *
 * So there is one route, `POST /batch`, and the body says which question it is. `type` selects the
 * module that reads the rest; adding a batchable question adds a variant here and a handler there,
 * and no route at all. See spec/architecture/artifacts.md, "One batch entry point".
 */
import * as v from 'valibot';
import { LOCALE_CODES, type LocaleCode } from '@canmi/locales';
import type { Resource, ViewAnswer } from './index.ts';

/** A slug names an article; the list is bounded so one request cannot ask for the whole corpus. */
const slugs = v.pipe(v.array(v.string()), v.maxLength(64));

/**
 * Several articles in several languages, as the cross product.
 *
 * One shape for two gestures: a language menu is one slug and many locales, a homepage warming
 * its list is many slugs and one locale. They were two routes and are one question.
 */
export const ArticlesRequestSchema = v.object({
	type: v.literal('articles'),
	slugs,
	locales: v.pipe(v.array(v.picklist(LOCALE_CODES)), v.maxLength(LOCALE_CODES.length)),
});

/** How many times each of these articles has been read, without any of it counting as a read. */
export const ReadsRequestSchema = v.object({
	type: v.literal('reads'),
	slugs,
});

/**
 * What every rid on one page currently means, asked once.
 *
 * An arm here rather than a fan of `GET /media?rid=`, and bounded like the slugs above: one
 * page's worth, not a walk of the corpus. Unchecked against the id pattern for the reason `slugs`
 * is -- a string that could never be one comes back absent, which is the same answer sooner. See
 * spec/architecture/resource.md, "One question per page, not one per resource".
 */
export const ResourcesRequestSchema = v.object({
	type: v.literal('resources'),
	rids: v.pipe(v.array(v.string()), v.maxLength(64)),
});

/**
 * What arrives at `/batch`, discriminated by `type`.
 *
 * A variant rather than a union of objects: valibot reads `type` first and reports the failure
 * against that one branch, so a malformed `reads` body is not also reported as a bad `articles`.
 */
export const BatchRequestSchema = v.variant('type', [
	ArticlesRequestSchema,
	ReadsRequestSchema,
	ResourcesRequestSchema,
]);

export type BatchRequest = v.InferOutput<typeof BatchRequestSchema>;
export type BatchType = BatchRequest['type'];

/**
 * One article's views, named once each.
 *
 * `path` and `url` sit above the views rather than inside every one, which is the only reason this
 * is not a list of `/article` answers. The slug is not in here at all: it is the key this article
 * is filed under, and repeating it inside would be the same fact twice.
 */
export type BatchedArticle = {
	path: string;
	url: string;
	views: Partial<Record<LocaleCode, Omit<ViewAnswer, 'slug' | 'path' | 'url'>>>;
};

/**
 * What `/batch` answers, carrying back the `type` it was asked.
 *
 * Echoed rather than assumed: a consumer holding an answer can tell what it is an answer to
 * without remembering what it sent. A slug or a rid the corpus does not name is absent rather
 * than an error. Every map is keyed by what was asked with -- the identity, never the address --
 * because an answer keyed by anything else could not be matched back to the question without the
 * caller deriving one from the other.
 */
export type BatchAnswer =
	| { type: 'articles'; articles: Record<string, BatchedArticle> }
	| { type: 'reads'; reads: Record<string, number> }
	| { type: 'resources'; resources: Record<string, Resource> };

export type BatchAnswerOf<T extends BatchType> = Extract<BatchAnswer, { type: T }>;

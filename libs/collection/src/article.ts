/**
 * What an article has to have, and the draft form of the same declaration.
 *
 * One schema, and the optional form is computed from it rather than written beside it: a draft is
 * `v.partial` of a published article, so the two cannot drift into disagreeing about what a field
 * is called or whether it exists. What differs between them is only which fields may be absent.
 *
 * The database still has the final word. This layer exists so that a person is told what is
 * missing in one sentence; a constraint tells them one column at a time, and only at the end.
 */
import * as v from 'valibot';

/**
 * Required means written, not present. An empty string is what an untouched form sends, and
 * `v.string()` accepts it -- so the first article published from the editor was a typeless page
 * at the address `''` with no title, and nothing objected. Measured, not imagined.
 */
const written = v.pipe(v.string(), v.trim(), v.nonEmpty());

export const articleMeta = v.object({
	title: written,
	subtitle: v.optional(v.string()),
	description: v.optional(v.string()),
	language: written,
	/** The address, without a leading slash: `architecture/compile-time-rendering`. */
	path: written,
});

/** The same fields, every one of them absent until somebody decides it. */
export const draftMeta = v.partial(articleMeta);

export type ArticleMeta = v.InferOutput<typeof articleMeta>;
export type DraftMeta = v.InferOutput<typeof draftMeta>;

/**
 * Where each field lands once the draft is published, named so that adding one is not silent.
 *
 * A field with no entry here is a field the publication would drop, and the test beside this file
 * refuses that: the two sides are declared once each and compared, so forgetting to carry a new
 * field across fails at check time rather than at the first article that needed it.
 */
export const DESTINATIONS: Record<keyof ArticleMeta, string> = {
	title: 'resource.layers.article.title',
	subtitle: 'resource.layers.article.subtitle',
	description: 'resource.layers.article.description',
	language: 'resource.layers.article.language',
	path: 'path.path',
};

/** The type chain an article is granted when it stops being a draft. */
export const ARTICLE_TYPE = 'document.article';

/** The standalone page, which is a document and stops: it has nothing an article does not. */
export const PAGE_TYPE = 'document';

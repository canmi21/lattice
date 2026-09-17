/**
 * `POST /batch` -- every question that is asked about many things at once.
 *
 * One route, and the body says which question. A batch cannot be a `GET` because a list does not
 * belong in a URL, and giving each batchable question its own route meant inventing a second name
 * for something already named singly -- `/views` beside `/article`, `/read-counts` beside `/read`.
 * `type` picks the handler instead, so a new batchable question costs a variant in the contract
 * and a case here, and no route at all.
 *
 * Nothing here is cacheable, which is the trade a batch makes. A `POST` is not a cacheable request,
 * so the caller memoises what it asked for; see the site's `cache.ts`. See
 * spec/architecture/artifacts.md, "One batch entry point".
 */
import {
	BatchRequestSchema,
	type BatchAnswer,
	type BatchedArticle,
	type ReadsRequestSchema,
	type ArticlesRequestSchema,
} from '@canmi/artifacts';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import * as v from 'valibot';
import type { Bindings } from './bindings';
import { articleReads } from './schema';
import { failure, success } from './respond';
import { findArticle, rootOf } from './root';

/** Room for the longest question this takes: 64 slugs and nine locales. */
const MAX_BODY_SIZE = 8_192;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

const batch = new Hono<{ Bindings: Bindings }>();

batch.post(
	'/batch',
	bodyLimit({
		maxSize: MAX_BODY_SIZE,
		onError: (c) => failure(c, 413, 'body_too_large', NO_STORE),
	}),
	async (c) => {
		const body = await c.req.json().catch(() => undefined);
		const asked = v.safeParse(BatchRequestSchema, body);
		// The schema names the type it could not read, which is more useful than "bad request"
		// when one route answers several questions.
		if (!asked.success) return failure(c, 400, 'unreadable_batch', NO_STORE);

		const answer =
			asked.output.type === 'articles'
				? await articles(c.env, asked.output)
				: await reads(c.env, asked.output);
		return success(c, answer satisfies BatchAnswer, NO_STORE);
	},
);

/**
 * Several articles in several languages, as the cross product.
 *
 * A slug the corpus does not name is absent, and so is a locale an article has no view in -- both
 * are answers rather than errors, because this is what a consumer asks before it knows which of
 * them exist.
 */
async function articles(
	env: Bindings,
	asked: v.InferOutput<typeof ArticlesRequestSchema>,
): Promise<BatchAnswer> {
	const root = await rootOf(env);
	const found: Record<string, BatchedArticle> = {};
	for (const slug of asked.slugs) {
		const article = findArticle(root, slug);
		if (!article) continue;
		const views: BatchedArticle['views'] = {};
		for (const code of asked.locales) {
			const view = article.views[code];
			if (!view) continue;
			const { locale: language, ...rest } = view;
			views[code] = { ...rest, locale: { ...language, code } };
		}
		// The article's own path, not the one that was asked for: it is what the consumer checks
		// the fetched object's envelope against.
		found[article.path] = { url: article.url, views };
	}
	return { type: 'articles', articles: found };
}

/**
 * How many times each article has been read, in one query and without counting a read.
 *
 * Checked against the corpus first, so a slug nobody published cannot open a row; zero for an
 * article nobody has read yet, and nothing at all for one that does not exist.
 */
async function reads(
	env: Bindings,
	asked: v.InferOutput<typeof ReadsRequestSchema>,
): Promise<BatchAnswer> {
	const root = await rootOf(env);
	const known = [...new Set(asked.slugs)].filter((slug) => findArticle(root, slug));
	if (known.length === 0) return { type: 'reads', reads: {} };

	const rows = await drizzle(env.DATABASE)
		.select({ slug: articleReads.slug, count: articleReads.count })
		.from(articleReads)
		.where(inArray(articleReads.slug, known));
	const counted = new Map(rows.map((row) => [row.slug, row.count]));
	return {
		type: 'reads',
		reads: Object.fromEntries(known.map((slug) => [slug, counted.get(slug) ?? 0])),
	};
}

/**
 * Any other method on this path, answered as the method problem it is.
 *
 * Registered after the POST, so it catches what that one did not. A bare 404 is what hono gives
 * for a path it knows under another method, and it is the least useful answer available: typing
 * this URL into a browser is the first thing anyone does, and a GET is what a browser sends.
 */
batch.all('/batch', (c) => failure(c, 405, 'batch_takes_post', { ...NO_STORE, Allow: 'POST' }));

export default batch;

import { ROOT_KEY, RootSchema, type Root, type RootArticle } from '@canmi/artifacts';
import { read } from '@canmi/store';
import * as v from 'valibot';
import type { Bindings } from './bindings';

/**
 * The one mutable object, read and parsed.
 *
 * The only full schema parse in this worker -- see spec/architecture/artifacts.md, "Validation is
 * heavy where it is free and light where it is not". A root that will not read or will not parse
 * is a failure rather than an empty corpus, which would blank the site for as long as it cached.
 */

/**
 * How long one isolate reuses a parsed root.
 *
 * Well under the five minutes an answer is cached for, because the two delays add and the design
 * promises one publication delay rather than two.
 */
const MEMO_MS = 30_000;

type Memo = { at: number; root: Promise<Root> };

let memo: Memo | undefined;

export function rootOf(env: Bindings): Promise<Root> {
	const now = Date.now();
	if (memo && now - memo.at < MEMO_MS) return memo.root;

	// The promise is held rather than its value, so a burst of concurrent misses is one read of
	// the store and one parse. A failure is dropped instead: the next request retries rather
	// than inheriting the blip for the rest of the window.
	const entry: Memo = { at: now, root: load(env) };
	memo = entry;
	entry.root.catch(() => {
		if (memo === entry) memo = undefined;
	});
	return entry.root;
}

/** Forget the memo, for tests that hand one isolate more than one root. */
export function forgetRoot(): void {
	memo = undefined;
}

/** The article a path names, or nothing. Linear over a corpus whose size is in the dozens. */
export function findArticle(root: Root, path: string): RootArticle | undefined {
	return root.articles.find((article) => article.path === path);
}

async function load(env: Bindings): Promise<Root> {
	const found = await read(env, ROOT_KEY);
	if (!found) throw new Error(`${ROOT_KEY} is not in the store`);
	const body: unknown = await new Response(found.body).json();
	return v.parse(RootSchema, body);
}

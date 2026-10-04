/**
 * Publishing, and the history that publishing writes. Editing a draft is not a revision.
 *
 * The chain is stored in reverse: the newest row carries the cid of the bytes the site serves,
 * and every older row carries the patch that walks one step back from the row after it. Reading
 * what is published costs a fetch, reading history costs one patch per step, and nothing is
 * stored twice. `composed` is what each reconstruction must hash to, so a chain that has drifted
 * says so instead of handing back a text that is nearly right.
 *
 * See spec/todo/milestones.md, "An article is `document.article`, and its state is counted".
 */
import { applyPatches, makePatches, parsePatch, stringifyPatches } from '@sanity/diff-match-patch';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import * as v from 'valibot';
import { ARTICLE_TYPE, articleMeta, type ArticleMeta } from './article.ts';
import { contentId, type ContentStore } from './store.ts';
import { contents, documents, drafts, paths, place, resources, revisions } from './source.ts';
import type { SourceDatabase } from './open.ts';

/** How a patch is written. Per row, so that changing it is a decision and not a migration. */
const FORMAT = 'dmp-1';

/**
 * What the resource's `article` layer holds, which is the metadata minus its address.
 *
 * The address is a row in `path`, because that table is also the redirect history; keeping it
 * here as well would be the same fact in the copy nothing validates. See `DESTINATIONS`.
 */
export function articleLayers(meta: ArticleMeta) {
	const { path: _address, ...rest } = meta;
	return { article: { version: 1, ...rest } };
}

/** A publication that happened, or a reason it did not. Both are answers the editor displays. */
export type Publication =
	| { published: true; seq: number; cid: string; at: string }
	| { published: false; refused: 'no-draft' | 'unchanged' | 'name-taken'; detail: string }
	| { published: false; refused: 'incomplete'; detail: string; missing: string[] };

/**
 * Publish whatever the draft row currently holds, as the next revision.
 *
 * No text is passed: the draft is the working copy before the first publication and after every
 * one, so what is published is what is in the editor and nowhere else.
 *
 * Bytes are written before rows, and outside the transaction. An object nothing references is
 * collected later; a row naming bytes that are absent is a broken article.
 */
export async function publish(
	database: SourceDatabase,
	store: ContentStore,
	rid: string,
	options: { at?: string; note?: string } = {},
): Promise<Publication> {
	const [draft] = await database.select().from(drafts).where(eq(drafts.resource, rid));
	if (!draft) return { published: false, refused: 'no-draft', detail: `${rid} has no draft` };

	const text = draft.body;
	const cid = contentId(text);
	const head = await headOf(database, rid);

	// The refusal the author chose: a revision says what this version's text is, not how many
	// times a button was pressed. Metadata is not in the text, so changing a title is not a
	// publication either -- it is a row, and A5 is where that stops needing one.
	if (head && head.cid === cid) {
		return { published: false, refused: 'unchanged', detail: 'the text is what is published' };
	}

	const at = options.at ?? new Date().toISOString();
	let opening: { meta: ArticleMeta } | undefined;
	if (!head) {
		const parsed = v.safeParse(articleMeta, draft.meta);
		if (!parsed.success) {
			// Named in one sentence rather than one column at a time: a draft is deliberately free
			// of constraints, so this is the first moment anything has been asked of it.
			const missing = parsed.issues.map((issue) => v.getDotPath(issue) ?? '(the whole record)');
			return {
				published: false,
				refused: 'incomplete',
				detail: `not enough to publish: ${missing.join(', ')}`,
				missing,
			};
		}
		opening = { meta: parsed.output };

		// Asked rather than left to the unique index, so the answer is a sentence the editor can
		// show. The index is still there and is what makes this safe: two publications racing
		// would both pass this check and only one would pass that. See source.ts.
		const { slug } = place(parsed.output.path);
		const [taken] = await database
			.select({ resource: paths.resource })
			.from(paths)
			.where(and(eq(paths.slug, slug), isNull(paths.until), ne(paths.resource, rid)));
		if (taken) {
			return {
				published: false,
				refused: 'name-taken',
				detail: `${taken.resource} already answers to ${slug}`,
			};
		}
	}

	// The patch walks from the text being published back to the one it replaces, which is what
	// makes the newest row the cheap one to read.
	const back = head
		? stringifyPatches(makePatches(text, await store.read(head.cid!), { margin: 8 }))
		: undefined;

	await store.write(cid, text);

	const seq = (head?.seq ?? 0) + 1;
	database.transaction((tx) => {
		tx.insert(contents)
			.values({ cid, mime: 'text/markdown', bytes: text.length, created: at, layers: {} })
			.onConflictDoNothing()
			.run();
		if (opening) {
			tx.update(resources)
				.set({ type: ARTICLE_TYPE, layers: articleLayers(opening.meta), updated: at })
				.where(eq(resources.id, rid))
				.run();
			tx.insert(documents).values({ resource: rid }).onConflictDoNothing().run();
			tx.insert(paths)
				.values({ resource: rid, ...place(opening.meta.path), since: at })
				.run();
		} else {
			tx.update(resources).set({ updated: at }).where(eq(resources.id, rid)).run();
		}
		if (head) {
			tx.update(revisions)
				.set({ cid: null, backDiff: back })
				.where(and(eq(revisions.resource, rid), eq(revisions.seq, head.seq)))
				.run();
		}
		tx.insert(revisions)
			.values({ resource: rid, seq, at, cid, composed: cid, format: FORMAT, note: options.note })
			.run();
	});

	return { published: true, seq, cid, at };
}

/** The one revision holding bytes, which the CHECK constraint keeps to one per resource. */
async function headOf(database: SourceDatabase, rid: string) {
	const [row] = await database
		.select()
		.from(revisions)
		.where(and(eq(revisions.resource, rid), isNull(revisions.backDiff)))
		.limit(1);
	return row;
}

/**
 * The text as of one revision, reconstructed and then checked against what it should hash to.
 *
 * Verified rather than trusted: a patch that failed to apply cleanly produces a text that is
 * plausible, and content addressing is already here to say whether it is the right one.
 */
export async function textAt(
	database: SourceDatabase,
	store: ContentStore,
	rid: string,
	seq: number,
): Promise<string> {
	const rows = await database
		.select()
		.from(revisions)
		.where(eq(revisions.resource, rid))
		.orderBy(desc(revisions.seq));
	const head = rows[0];
	if (!head?.cid) throw new Error(`${rid} has no published revision`);
	if (seq > head.seq || seq < 1) throw new Error(`${rid} has no revision ${seq}`);

	let text = await store.read(head.cid);
	for (const row of rows.slice(1)) {
		if (row.seq < seq) break;
		const [walked, applied] = applyPatches(parsePatch(row.backDiff!), text);
		if (applied.includes(false)) throw new Error(`the patch at ${rid}/${row.seq} did not apply`);
		text = walked;
	}
	const wanted = rows.find((row) => row.seq === seq)!;
	if (contentId(text) !== wanted.composed) {
		throw new Error(`${rid}/${seq} reconstructed to ${contentId(text)}, not ${wanted.composed}`);
	}
	return text;
}

/**
 * The two dates a reader is shown, which are the ends of the chain and are stored nowhere else.
 *
 * Absent for an article with no revisions, because that is what unpublished means here: there is
 * no flag to disagree with, so the question and the state are the same question.
 */
export async function dates(
	database: SourceDatabase,
	rid: string,
): Promise<{ published: string; updated: string } | undefined> {
	const rows = await database
		.select({ seq: revisions.seq, at: revisions.at })
		.from(revisions)
		.where(eq(revisions.resource, rid))
		.orderBy(revisions.seq);
	if (rows.length === 0) return undefined;
	return { published: rows[0]!.at, updated: rows[rows.length - 1]!.at };
}

/**
 * Correct when a revision happened, which is allowed exactly until somebody says it is settled.
 *
 * Only the moment moves. The text, its cid and its place in the chain are what the revision is,
 * and none of them is what an import got wrong.
 */
export async function retime(
	database: SourceDatabase,
	rid: string,
	seq: number,
	at: string,
): Promise<void> {
	const [row] = await database
		.select()
		.from(revisions)
		.where(and(eq(revisions.resource, rid), eq(revisions.seq, seq)));
	if (!row) throw new Error(`${rid} has no revision ${seq}`);
	if (row.atLocked) throw new Error(`${rid}/${seq} is locked at ${row.at}`);
	await database
		.update(revisions)
		.set({ at })
		.where(and(eq(revisions.resource, rid), eq(revisions.seq, seq)));
}

/**
 * Settle a revision's moment, one way and by hand.
 *
 * Nothing takes this automatically. A date that locked itself on publication would be a date
 * nobody could correct afterwards, which is the case the editable moment exists for.
 */
export async function lockTime(database: SourceDatabase, rid: string, seq: number): Promise<void> {
	await database
		.update(revisions)
		.set({ atLocked: true })
		.where(and(eq(revisions.resource, rid), eq(revisions.seq, seq)));
}

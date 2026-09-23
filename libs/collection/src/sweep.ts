/**
 * What still names a run of bytes, and what has stopped.
 *
 * A reference table rather than a counter, for the reason spec/todo/milestones.md gives: a count
 * drifts by one on any path that forgets it, permanently and in silence, and in the direction
 * that deletes something a page still shows. A table answers "what is holding this alive" with
 * the names of the things holding it, which is what makes a dry run readable.
 *
 * The table is rebuilt from the authored database rather than written as things change, which is
 * the other half of the same argument: a set recomputed from the source of truth cannot disagree
 * with it. That is affordable because it lives in the derived database, which exists to be thrown
 * away -- see derived.ts.
 */
import { eq, inArray } from 'drizzle-orm';
import { resolve } from 'node:path';
import { references, unreferenced } from './derived.ts';
import { contentDerivations, contents, resourceContents, revisions } from './source.ts';
import type { DerivedDatabase, SourceDatabase } from './open.ts';

/** How long something nothing names waits before a sweep may take it. */
export const GRACE_HOURS = 24;

export type Reference = { fromKind: string; fromId: string; cid: string; via: string | null };

/**
 * Every reference the authored database holds, resolved to the bytes rather than to the name.
 *
 * Two hops, and the row lands on the second: an article names a rid and the rid names a content,
 * so repointing a resource moves its references with it rather than leaving one behind. A
 * revision is the exception that proves it -- it names bytes directly, because a published
 * version is those exact bytes and not whatever the article holds now.
 */
export async function collect(database: SourceDatabase): Promise<Reference[]> {
	const found: Reference[] = [];

	// The head of every chain. Older revisions carry a patch rather than bytes, so they name no
	// content -- what they reconstruct to is checked against `composed` and stored nowhere.
	const heads = await database
		.select({ resource: revisions.resource, seq: revisions.seq, cid: revisions.cid })
		.from(revisions);
	for (const row of heads) {
		if (row.cid === null) continue;
		found.push({ fromKind: 'revision', fromId: `${row.resource}/${row.seq}`, cid: row.cid, via: null });
	}

	// What a resource currently holds, which is the hop a rid resolves through.
	const held = await database
		.select({ resource: resourceContents.resource, cid: resourceContents.cid, slot: resourceContents.slot })
		.from(resourceContents);
	for (const row of held) {
		found.push({ fromKind: 'resource', fromId: `${row.resource}/${row.slot}`, cid: row.cid, via: row.resource });
	}

	// A derived variant is alive while its original is, and dies with it: nothing else names one.
	const derived = await database
		.select({ source: contentDerivations.source, cid: contentDerivations.cid })
		.from(contentDerivations);
	for (const row of derived) {
		found.push({ fromKind: 'content', fromId: row.source, cid: row.cid, via: null });
	}

	return found;
}

export type Sweep = {
	/** Every reference, so a report can say which thing is holding a content alive. */
	references: Reference[];
	/** Contents nothing names, with the moment the clock started. */
	waiting: { cid: string; since: string }[];
	/** Those whose grace has run out, which a sweep may take. */
	collectable: { cid: string; since: string }[];
	/** Contents that were unreferenced and are named again, so their clock was cleared. */
	revived: string[];
};

/**
 * Rebuild the reference table, move the clock on, and report -- without deleting anything.
 *
 * Being in `unreferenced` is not being deleted. The row exists so that the grace period is a
 * fact with a start rather than a guess, and a content that is named again has its row removed
 * rather than kept with a flag: the question this table answers is "since when", and a thing
 * that is referenced has no answer to it.
 */
export async function reconcile(
	source: SourceDatabase,
	derived: DerivedDatabase,
	now: Date = new Date(),
): Promise<Sweep> {
	const found = await collect(source);
	const named = new Set(found.map((row) => row.cid));

	derived.transaction((tx) => {
		tx.delete(references).run();
		for (const row of found) tx.insert(references).values(row).onConflictDoNothing().run();
	});

	const stored = await source.select({ cid: contents.cid }).from(contents);
	const orphans = stored.map((row) => row.cid).filter((cid) => !named.has(cid));

	const waiting = await derived.select().from(unreferenced);
	const clocked = new Map(waiting.map((row) => [row.cid, row]));
	const at = now.toISOString();
	const revived = waiting.filter((row) => named.has(row.cid)).map((row) => row.cid);

	derived.transaction((tx) => {
		if (revived.length > 0) tx.delete(unreferenced).where(inArray(unreferenced.cid, revived)).run();
		for (const cid of orphans) {
			if (clocked.has(cid)) continue;
			tx.insert(unreferenced).values({ cid, since: at }).onConflictDoNothing().run();
		}
	});

	const after = await derived.select().from(unreferenced);
	const deadline = now.getTime() - GRACE_HOURS * 60 * 60 * 1000;
	return {
		references: found,
		waiting: after.map((row) => ({ cid: row.cid, since: row.since })),
		collectable: after
			.filter((row) => !row.collected && Date.parse(row.since) <= deadline)
			.map((row) => ({ cid: row.cid, since: row.since })),
		revived,
	};
}

/**
 * Take what the grace period has released, and say what was taken.
 *
 * Separate from `reconcile` on purpose: one computes and the other destroys, so the report is
 * not something a caller gets the deletion with by forgetting an argument.
 *
 * Bytes first, then the row, and `collected` set rather than the row dropped -- what a sweep
 * took is the one thing it cannot recompute.
 */
export async function sweep(
	source: SourceDatabase,
	derived: DerivedDatabase,
	store: { forget(cid: string): Promise<void> },
	now: Date = new Date(),
): Promise<string[]> {
	const { collectable } = await reconcile(source, derived, now);
	const taken: string[] = [];
	for (const { cid } of collectable) {
		await store.forget(cid);
		await source.delete(contents).where(eq(contents.cid, cid));
		await derived.update(unreferenced).set({ collected: true }).where(eq(unreferenced.cid, cid));
		taken.push(cid);
	}
	return taken;
}

/**
 * What is holding one content alive, in the words of the things holding it.
 *
 * The reason a table was chosen over a count: this answer exists. A number can only say that
 * something is reachable, which is no help to somebody deciding whether it should be.
 */
export async function holders(derived: DerivedDatabase, cid: string): Promise<Reference[]> {
	const rows = await derived.select().from(references).where(eq(references.cid, cid));
	return rows.map((row) => ({ ...row }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { dirname: dir, join } = await import('node:path');
	const { fileURLToPath: toPath } = await import('node:url');
	const { openDerived, openSource, DERIVED_FILE, SOURCE_FILE } = await import('./open.ts');
	const repository = resolve(dir(toPath(import.meta.url)), '../../..');
	const { fileStore, OBJECTS_DIR } = await import('./store.ts');
	const source = openSource(join(repository, SOURCE_FILE));
	const derived = openDerived(join(repository, DERIVED_FILE));

	// Reporting is the default and deleting is not. A sweep is the one operation here that cannot
	// be undone, so it is spelled out rather than defaulted into -- see spec/todo/milestones.md.
	const swept = await reconcile(source, derived);
	console.log(
		`${swept.references.length} references, ${swept.waiting.length} waiting, ` +
			`${swept.collectable.length} past ${GRACE_HOURS}h, ${swept.revived.length} revived`,
	);
	for (const { cid, since } of swept.collectable) console.log(`  collectable ${cid} since ${since}`);

	if (!process.argv.includes('--collect')) {
		if (swept.collectable.length > 0) console.log('pass --collect to take them');
	} else {
		const taken = await sweep(source, derived, fileStore(join(repository, OBJECTS_DIR)));
		console.log(`collected ${taken.length}`);
	}
}

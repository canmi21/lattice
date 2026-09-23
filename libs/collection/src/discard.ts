/**
 * Taking back a draft that was never published: its working copy and the identity reserved for it.
 *
 * Only that. An article with a revision has been published, and taking it back is taking it off
 * the site, which is a different act with its own consequences and is not this one -- so it is
 * refused, and says so. Deleting removes one thing and never what it pointed at
 * (spec/todo/milestones.md, "Deleting removes one thing, and never what it pointed at"): the draft
 * row and the resource row go, and if anything else still names the rid, the database's own
 * foreign keys refuse the whole of it and nothing is removed.
 *
 * The collection is not in version control and not yet backed up, so this cannot be undone; the
 * surface that calls it asks twice.
 */
import { count, eq } from 'drizzle-orm';
import { drafts, resources, revisions } from './source.ts';
import type { SourceDatabase } from './open.ts';

export type Discarded =
	| { discarded: true }
	| { discarded: false; refused: 'absent' | 'published' | 'referenced'; detail: string };

export async function discard(database: SourceDatabase, rid: string): Promise<Discarded> {
	const [draft] = await database.select().from(drafts).where(eq(drafts.resource, rid));
	if (!draft) return { discarded: false, refused: 'absent', detail: `${rid} has no draft` };

	const [published] = await database
		.select({ n: count() })
		.from(revisions)
		.where(eq(revisions.resource, rid));
	if ((published?.n ?? 0) > 0) {
		return {
			discarded: false,
			refused: 'published',
			detail: `${rid} has been published, and taking it off the site is not a deletion`,
		};
	}

	try {
		database.transaction((tx) => {
			tx.delete(drafts).where(eq(drafts.resource, rid)).run();
			tx.delete(resources).where(eq(resources.id, rid)).run();
		});
	} catch (error) {
		// A foreign key: something other than the draft still names this rid.
		return {
			discarded: false,
			refused: 'referenced',
			detail: `${rid} is still named: ${String(error)}`,
		};
	}
	return { discarded: true };
}

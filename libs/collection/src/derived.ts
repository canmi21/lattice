/**
 * The derived database: everything a full scan could write again.
 *
 * Separate from the authored half so that the backup boundary is visible in the filesystem --
 * this file may be deleted at any time and rebuilt, and it will grow faster than the one that
 * may not. Nothing here declares a foreign key: the ids it holds live in the other file, which
 * SQLite cannot reach across, and enforcement would be worth arguing for only if losing this
 * file were a loss.
 */
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * One row per reference, which is what decides whether an object may ever be collected.
 *
 * A count would drift by one on any path that forgot it, permanently and in silence, and in the
 * direction that deletes something a page still shows. A table answers "what is holding this
 * alive" with the names of the things holding it, which is also what makes a dry run readable.
 *
 * The row lands on the resolved cid, the second of the two hops -- an article names a rid and the
 * rid names bytes -- so repointing a resource moves its references with it.
 */
export const references = sqliteTable(
	'reference',
	{
		fromKind: text('from_kind').notNull(),
		fromId: text('from_id').notNull(),
		cid: text('cid').notNull(),
		via: text('via'),
	},
	(table) => [
		primaryKey({ columns: [table.fromKind, table.fromId, table.cid] }),
		index('reference_by_cid').on(table.cid),
	],
);

/**
 * What nothing names, and since when.
 *
 * Being in this table is not being deleted. An entry becomes collectable 24 hours after `since`,
 * and collection happens when a sweep runs -- scheduled in the cloud, by hand here. Nothing
 * disappears as a side effect of an edit.
 */
export const unreferenced = sqliteTable('unreferenced', {
	cid: text('cid').primaryKey(),
	since: text('since').notNull(),
	collected: integer('collected', { mode: 'boolean' }).notNull().default(false),
});

/**
 * The corpus after the move, checked on the corpus itself rather than on a fixture.
 *
 * Nine articles and one page, and the only thing that decides which of them a reader can open is
 * whether a revision exists. The dates are the ones the frontmatter witnesses, because this pass
 * is the gate that lets them in.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { importArticles } from './articles.ts';
import * as schema from './source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = resolve(HERE, '../../..');

async function imported() {
	const database = drizzle(new Database(':memory:'), { schema });
	migrate(database, { migrationsFolder: resolve(HERE, '../drizzle/source') });
	const tally = await importArticles(database, REPOSITORY);
	return { database, tally };
}

it('publishes what carries no draft flag and holds the rest as drafts', async () => {
	const { database, tally } = await imported();
	expect(tally).toEqual({ published: 7, drafted: 3 });
	const revisions = await database.select().from(schema.revisions);
	const drafts = await database.select().from(schema.drafts);
	// State is counted: every published thing has its first revision, and no draft has one.
	expect(revisions).toHaveLength(tally.published);
	expect(drafts).toHaveLength(tally.drafted);
	expect(revisions.every((row) => row.seq === 1 && row.cid !== null)).toBe(true);
});

it('leaves a draft without a type, because nobody has said what it will be', async () => {
	const { database } = await imported();
	const held = await database.select().from(schema.resources);
	const drafted = await database.select().from(schema.drafts);
	const ids = new Set(drafted.map((row) => row.resource));
	expect(held.filter((row) => ids.has(row.id)).every((row) => row.type === null)).toBe(true);
	expect(
		held.filter((row) => !ids.has(row.id)).every((row) => row.type?.startsWith('document')),
	).toBe(true);
});

it('takes the publication date from the frontmatter, which is what this gate is for', async () => {
	const { database } = await imported();
	const rows = await database.select().from(schema.revisions);
	const earliest = rows.map((row) => row.at).sort()[0];
	expect(earliest).toBe('2026-03-24T08:49:57Z');
});

it('runs twice with the same tally, and grants no id it then abandons', async () => {
	const { database, tally } = await imported();
	const again = await importArticles(database, REPOSITORY);
	expect(again).toEqual(tally);
	const held = await database.select().from(schema.resources);
	expect(held).toHaveLength(tally.published + tally.drafted);
});

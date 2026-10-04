/**
 * What an article says about itself, and what setting one field must not do to the rest.
 *
 * The cases here are the ones a whole-object write gets wrong in silence: a caller that passes a
 * description and clears the title, an address that is replaced instead of retired, a date that
 * looks settable and is not.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { move, read, set } from './meta.ts';
import { publish } from './revise.ts';
import { memoryStore } from './store.ts';
import * as schema from './source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = '2026-09-23T00:00:00Z';
const RID = 'k7m2x';
const META = { title: 'Observation to lowering', language: 'en', path: 'architecture/lowering' };

function fresh() {
	const connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	const database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: resolve(HERE, '../drizzle/source') });
	return database;
}

describe('article metadata', () => {
	let database: ReturnType<typeof fresh>;

	async function published() {
		await database
			.insert(schema.resources)
			.values({ id: RID, created: NOW, updated: NOW, layers: {} });
		await database
			.insert(schema.drafts)
			.values({ resource: RID, body: 'One.\n', meta: META, created: NOW, updated: NOW });
		await publish(database, memoryStore(), RID, { at: NOW });
	}

	beforeEach(() => {
		database = fresh();
	});

	it('reports what the article is, from whichever table each part came out of', async () => {
		await published();
		const held = await read(database, RID);
		expect(held).toMatchObject({
			type: 'document.article',
			path: META.path,
			published: NOW,
			// Not a stored field: one revision means it was last modified when it was published.
			lastmod: NOW,
			locked: false,
		});
		expect(held?.layer.title).toBe(META.title);
	});

	it('sets one field without clearing the others', async () => {
		await published();
		await set(database, RID, { description: 'What a compiler settles.' });
		const held = await read(database, RID);
		// The failure a whole-object write makes in silence, which is why `set` merges.
		expect(held?.layer.title).toBe(META.title);
		expect(held?.layer.language).toBe('en');
		expect(held?.layer.description).toBe('What a compiler settles.');
	});

	it('refuses a change that would leave the article unable to describe itself', async () => {
		await published();
		await expect(set(database, RID, { title: '   ' })).rejects.toThrow(/without: title/);
		// Nothing was written, so the article still says what it said.
		expect((await read(database, RID))?.layer.title).toBe(META.title);
	});

	it('retires the old address rather than overwriting it', async () => {
		await published();
		await move(database, RID, 'convention/lowering');

		expect((await read(database, RID))?.path).toBe('convention/lowering');
		// The old row is what a link somebody else wrote resolves through.
		const all = await database.select().from(schema.paths);
		expect(all).toHaveLength(2);
		const current = all.filter((row) => row.until === null);
		expect(current).toHaveLength(1);
		expect(current[0]?.slug).toBe('lowering');
	});

	it('has no dates for a draft, because an article with no revision is one', async () => {
		await database
			.insert(schema.resources)
			.values({ id: 'zz9pl', created: NOW, updated: NOW, layers: {} });
		const held = await read(database, 'zz9pl');
		expect(held?.published).toBeUndefined();
		expect(held?.lastmod).toBeUndefined();
	});
});

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { discard } from './discard.ts';
import { publish } from './revise.ts';
import { memoryStore } from './store.ts';
import * as schema from './source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = '2026-09-23T00:00:00Z';
const RID = 'q8w3e';
const META = { title: 'A draft', language: 'en', path: 'convention/a-draft' };

function fresh() {
	const connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	const database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: resolve(HERE, '../drizzle/source') });
	return database;
}

describe('discarding a draft', () => {
	let database: ReturnType<typeof fresh>;

	beforeEach(async () => {
		database = fresh();
		await database
			.insert(schema.resources)
			.values({ id: RID, created: NOW, updated: NOW, layers: {} });
		await database
			.insert(schema.drafts)
			.values({ resource: RID, body: 'Some text.', meta: META, created: NOW, updated: NOW });
	});

	it('takes back a draft never published, and the identity reserved for it', async () => {
		expect(await discard(database, RID)).toEqual({ discarded: true });
		expect(await database.select().from(schema.drafts)).toEqual([]);
		expect(
			await database.select().from(schema.resources).where(eq(schema.resources.id, RID)),
		).toEqual([]);
	});

	it('refuses a published article, and leaves everything in place', async () => {
		await publish(database, memoryStore(), RID, { at: NOW });
		const refused = await discard(database, RID);
		expect(refused).toMatchObject({ discarded: false, refused: 'published' });
		expect(await database.select().from(schema.drafts)).toHaveLength(1);
	});

	it('refuses a draft that is not there', async () => {
		expect(await discard(database, 'zzzzz')).toMatchObject({ discarded: false, refused: 'absent' });
	});
});

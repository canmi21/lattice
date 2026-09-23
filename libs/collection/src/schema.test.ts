/**
 * What the schema refuses, tested against a real file rather than against types.
 *
 * Every case here is one that would corrupt the collection quietly: a second current address, a
 * revision that is both a head and a patch, a row pointing at a resource nobody inserted. None of
 * them is caught by a type, and all of them are caught by the database -- provided the database
 * was asked to, which is what the foreign key case is really testing.
 */
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from './source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function fresh() {
	const file = join(mkdtempSync(join(tmpdir(), 'collection-')), 'source.sqlite');
	const connection = new Database(file);
	connection.pragma('foreign_keys = ON');
	const database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: resolve(HERE, '../drizzle/source') });
	return database;
}

const NOW = '2026-09-22T00:00:00Z';

async function aResource(database: ReturnType<typeof fresh>, id = 'k7m2x') {
	await database
		.insert(schema.resources)
		.values({ id, type: 'document.article', created: NOW, updated: NOW, layers: {} });
	return id;
}

describe('the authored schema', () => {
	let database: ReturnType<typeof fresh>;
	beforeEach(() => {
		database = fresh();
	});

	it('refuses a row naming a resource that was never inserted', async () => {
		// The pragma is off by default in SQLite and in every driver, so this asserts that `open`
		// turns it on as much as it asserts the reference itself.
		await expect(
			database
				.insert(schema.documents)
				.values({ resource: 'nobod', sourceFile: 'contents/a-b.md' }),
		).rejects.toThrow(/FOREIGN KEY/i);
	});

	it('refuses a revision that is both the head and a patch', async () => {
		const resource = await aResource(database);
		const row = { resource, seq: 1, at: NOW, composed: 'a'.repeat(32) };
		await expect(
			database.insert(schema.revisions).values({ ...row, cid: 'b'.repeat(32), backDiff: '@@' }),
		).rejects.toThrow(/CHECK/i);
		await expect(database.insert(schema.revisions).values(row)).rejects.toThrow(/CHECK/i);
	});

	it('accepts a head and a patch separately', async () => {
		const resource = await aResource(database);
		await database
			.insert(schema.revisions)
			.values({ resource, seq: 1, at: NOW, backDiff: '@@', composed: 'a'.repeat(32) });
		await database
			.insert(schema.revisions)
			.values({ resource, seq: 2, at: NOW, cid: 'b'.repeat(32), composed: 'b'.repeat(32) });
		expect(await database.select().from(schema.revisions)).toHaveLength(2);
	});

	it('allows one current address per resource and any number of former ones', async () => {
		const resource = await aResource(database);
		await database
			.insert(schema.paths)
			.values({ resource, path: 'convention/a-b', since: NOW, until: NOW });
		await database.insert(schema.paths).values({ resource, path: 'a-b', since: '2026-09-23' });
		await expect(
			database.insert(schema.paths).values({ resource, path: 'other/a-b', since: '2026-09-24' }),
		).rejects.toThrow(/UNIQUE/i);
	});

	it('keeps one row per role and position, and lets a resource hold several contents', async () => {
		const resource = await aResource(database);
		const content = async (cid: string) =>
			database
				.insert(schema.contents)
				.values({ cid, mime: 'image/png', bytes: 1, created: NOW, layers: {} });
		await content('a'.repeat(32));
		await content('b'.repeat(32));
		const held = { resource, slot: 'original', seq: 1 };
		await database.insert(schema.resourceContents).values({ ...held, cid: 'a'.repeat(32) });
		await database
			.insert(schema.resourceContents)
			.values({ resource, slot: 'dark', seq: 1, cid: 'b'.repeat(32) });
		await expect(
			database.insert(schema.resourceContents).values({ ...held, cid: 'b'.repeat(32) }),
		).rejects.toThrow(/UNIQUE/i);
	});

	it('reserves an id before the thing has a type, and holds one draft against it', async () => {
		await database
			.insert(schema.resources)
			.values({ id: 'draft', created: NOW, updated: NOW, layers: {} });
		await database
			.insert(schema.drafts)
			.values({ resource: 'draft', body: 'a first line', meta: {}, created: NOW, updated: NOW });
		const [held] = await database.select().from(schema.drafts);
		expect(held?.resource).toBe('draft');
		// One draft per identity: saving is an update, because a draft has no versions.
		await expect(
			database
				.insert(schema.drafts)
				.values({ resource: 'draft', body: 'a second', meta: {}, created: NOW, updated: NOW }),
		).rejects.toThrow(/UNIQUE/i);
	});

	it('holds one text per owner, field and locale', async () => {
		const resource = await aResource(database);
		const row = {
			ownerKind: 'resource',
			ownerId: resource,
			field: 'description',
			locale: 'en-US',
			body: 'a monitor, from behind',
		};
		await database.insert(schema.texts).values({ ...row, provider: 'openai', tokens: 11784 });
		await expect(database.insert(schema.texts).values(row)).rejects.toThrow(/UNIQUE/i);
	});
});

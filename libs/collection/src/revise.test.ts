/**
 * The chain, tested by walking it: publish, edit, publish again, and ask for the old text back.
 *
 * Every case here is one the reverse-delta storage could get subtly wrong -- a patch made in the
 * wrong direction, a head left carrying bytes it no longer should, a reconstruction that is
 * plausible rather than right. None of them is caught by a type, and the last one is caught only
 * because `composed` says what the answer must hash to.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { and, eq } from 'drizzle-orm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { dates, lockTime, publish, retime, textAt } from './revise.ts';
import { memoryStore } from './store.ts';
import { address } from './source.ts';
import * as schema from './source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = '2026-09-22T00:00:00Z';
const RID = 'k7m2x';

const META = {
	title: 'Observation to lowering',
	language: 'en',
	path: 'architecture/observation-to-lowering',
};

function fresh() {
	const connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	const database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: resolve(HERE, '../drizzle/source') });
	return database;
}

describe('revisions', () => {
	let database: ReturnType<typeof fresh>;
	let store: ReturnType<typeof memoryStore>;

	/** An id reserved and typed into, which is what the editor leaves behind before publication. */
	async function drafted(body: string, meta: unknown = META) {
		await database
			.insert(schema.resources)
			.values({ id: RID, created: NOW, updated: NOW, layers: {} });
		await database
			.insert(schema.drafts)
			.values({ resource: RID, body, meta, created: NOW, updated: NOW });
	}

	const edit = (body: string) =>
		database.update(schema.drafts).set({ body }).where(eq(schema.drafts.resource, RID));

	beforeEach(() => {
		database = fresh();
		store = memoryStore();
	});

	it('turns a reserved id into an article, with an address and a first revision', async () => {
		await drafted('The first paragraph.\n');
		const done = await publish(database, store, RID, { at: NOW });
		expect(done).toMatchObject({ published: true, seq: 1, at: NOW });

		const [resource] = await database
			.select()
			.from(schema.resources)
			.where(eq(schema.resources.id, RID));
		expect(resource!.type).toBe('document.article');
		// The address is a row in `path` and not also a field in the layers, because that table is
		// the redirect history and a second copy is the one that goes stale.
		expect(resource!.layers).toEqual({
			article: { version: 1, title: META.title, language: 'en' },
		});
		const [held] = await database.select().from(schema.paths);
		expect(address(held!)).toBe(META.path);
	});

	it('refuses a draft that is not yet an article, and says which fields are missing', async () => {
		await drafted('Something, anyway.\n', { title: 'Untitled' });
		const refused = await publish(database, store, RID);
		expect(refused).toMatchObject({ published: false, refused: 'incomplete' });
		expect(refused).toHaveProperty('missing', expect.arrayContaining(['language', 'path']));
		// Nothing was written, so the next attempt is the first one again.
		expect(await database.select().from(schema.revisions)).toHaveLength(0);
	});

	it('refuses a field that was left blank, because an empty string is not an answer', async () => {
		// What an untouched form sends. `v.string()` accepts it, so this passed once and published
		// a typeless article at the address `''` -- the case this schema's `nonEmpty` exists for.
		await drafted('Something.\n', { title: '', language: '  ', path: '' });
		const refused = await publish(database, store, RID);
		expect(refused).toMatchObject({ published: false, refused: 'incomplete' });
		expect(refused).toHaveProperty(
			'missing',
			expect.arrayContaining(['title', 'language', 'path']),
		);
		expect(await database.select().from(schema.revisions)).toHaveLength(0);
	});

	it('refuses a second article under a name another one already answers to', async () => {
		// The rule `refuseBadSlugs` has held over the markdown files, moved to where the corpus
		// will be once those files are gone: a slug is the identity and the directory is only
		// where it lives, so two directories do not make two articles of one name.
		await drafted('First.\n');
		await publish(database, store, RID, { at: NOW });
		await database
			.insert(schema.resources)
			.values({ id: 'zz9pl', created: NOW, updated: NOW, layers: {} });
		await database.insert(schema.drafts).values({
			resource: 'zz9pl',
			body: 'Second.\n',
			meta: { ...META, path: 'mirror/observation-to-lowering' },
			created: NOW,
			updated: NOW,
		});
		const refused = await publish(database, store, 'zz9pl');
		expect(refused).toMatchObject({ published: false, refused: 'name-taken' });
		expect(await database.select().from(schema.paths)).toHaveLength(1);
	});

	it('refuses to publish text that is already published', async () => {
		await drafted('Unchanged.\n');
		await publish(database, store, RID, { at: NOW });
		const again = await publish(database, store, RID);
		expect(again).toMatchObject({ published: false, refused: 'unchanged' });
		expect(await database.select().from(schema.revisions)).toHaveLength(1);
	});

	it('moves the bytes to the newest revision and leaves a patch behind', async () => {
		await drafted('One.\n');
		await publish(database, store, RID, { at: NOW });
		await edit('One.\nTwo.\n');
		const second = await publish(database, store, RID, { at: '2026-09-23T00:00:00Z' });
		expect(second).toMatchObject({ published: true, seq: 2 });

		const rows = await database.select().from(schema.revisions).orderBy(schema.revisions.seq);
		expect(rows.map((row) => row.cid === null)).toEqual([true, false]);
		expect(rows[0]!.backDiff).toBeTruthy();
		expect(rows[0]!.format).toBe('dmp-1');
	});

	it('hands back exactly what was published, however many revisions ago', async () => {
		const texts = ['One.\n', 'One.\nTwo.\n', 'Zero.\nOne.\nTwo.\n', 'Zero.\nTwo.\n'];
		await drafted(texts[0]!);
		await publish(database, store, RID, { at: NOW });
		for (const text of texts.slice(1)) {
			await edit(text);
			await publish(database, store, RID);
		}
		for (const [index, text] of texts.entries()) {
			expect(await textAt(database, store, RID, index + 1)).toBe(text);
		}
	});

	it('refuses a reconstruction that does not hash to what the revision says', async () => {
		await drafted('One.\n');
		await publish(database, store, RID, { at: NOW });
		await edit('One.\nTwo.\n');
		await publish(database, store, RID);
		// A patch that applies cleanly and produces the wrong text, which is the failure a checksum
		// exists for: without `composed` this returns a document that is merely plausible.
		await database
			.update(schema.revisions)
			.set({ backDiff: '@@ -1,5 +1,5 @@\n-One.\n+Two.\n' })
			.where(and(eq(schema.revisions.resource, RID), eq(schema.revisions.seq, 1)));
		await expect(textAt(database, store, RID, 1)).rejects.toThrow(/reconstructed to|did not apply/);
	});

	it('derives both dates from the ends of the chain', async () => {
		await drafted('One.\n');
		await publish(database, store, RID, { at: NOW });
		await edit('Two.\n');
		await publish(database, store, RID, { at: '2026-09-25T00:00:00Z' });
		expect(await dates(database, RID)).toEqual({
			published: NOW,
			updated: '2026-09-25T00:00:00Z',
		});
	});

	it('has no dates while nothing is published, because that is what unpublished means', async () => {
		await drafted('Still writing.\n');
		expect(await dates(database, RID)).toBeUndefined();
	});

	it('lets a moment be corrected until it is locked, and never after', async () => {
		await drafted('Imported from somewhere it was already published.\n');
		await publish(database, store, RID, { at: NOW });
		await retime(database, RID, 1, '2024-01-01T00:00:00Z');
		expect((await dates(database, RID))!.published).toBe('2024-01-01T00:00:00Z');
		await lockTime(database, RID, 1);
		await expect(retime(database, RID, 1, '2025-01-01T00:00:00Z')).rejects.toThrow(/locked/);
		expect((await dates(database, RID))!.published).toBe('2024-01-01T00:00:00Z');
	});
});

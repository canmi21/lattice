/**
 * The sweep, tested on what it must never do.
 *
 * Every case here is one where getting it wrong deletes something a page still shows, or keeps
 * bytes forever. The grace period is tested by moving the clock rather than by waiting, which is
 * the only way a twenty-four hour rule is testable at all.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { GRACE_HOURS, holders, reconcile, sweep } from './sweep.ts';
import { memoryStore } from './store.ts';
import * as derivedSchema from './derived.ts';
import * as schema from './source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-09-23T00:00:00Z');
const LATER = new Date(NOW.getTime() + (GRACE_HOURS + 1) * 60 * 60 * 1000);

function open<T extends Record<string, unknown>>(folder: string, tables: T) {
	const connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	const database = drizzle(connection, { schema: tables });
	migrate(database, { migrationsFolder: resolve(HERE, `../drizzle/${folder}`) });
	return database;
}

describe('the sweep', () => {
	let source: ReturnType<typeof open<typeof schema>>;
	let derived: ReturnType<typeof open<typeof derivedSchema>>;

	/** A run of bytes the collection knows about, which is what a sweep decides the fate of. */
	async function content(cid: string) {
		await source
			.insert(schema.contents)
			.values({ cid, mime: 'image/avif', bytes: 1, created: NOW.toISOString(), layers: {} });
		return cid;
	}

	async function resource(id: string) {
		await source
			.insert(schema.resources)
			.values({ id, created: NOW.toISOString(), updated: NOW.toISOString(), layers: {} });
		return id;
	}

	beforeEach(() => {
		source = open('source', schema);
		derived = open('derived', derivedSchema);
	});

	it('keeps bytes a resource still holds, and names what is holding them', async () => {
		const cid = await content('a'.repeat(32));
		const rid = await resource('k7m2x');
		await source
			.insert(schema.resourceContents)
			.values({ resource: rid, cid, slot: 'original', seq: 1 });

		const swept = await reconcile(source, derived, NOW);
		expect(swept.waiting).toHaveLength(0);
		// The answer a count could not give: which thing is keeping this alive.
		expect(await holders(derived, cid)).toEqual([
			{ fromKind: 'resource', fromId: 'k7m2x/original', cid, via: 'k7m2x' },
		]);
	});

	it('keeps a published revision, which names its bytes directly', async () => {
		const cid = await content('b'.repeat(32));
		const rid = await resource('o984d');
		await source
			.insert(schema.revisions)
			.values({ resource: rid, seq: 1, at: NOW.toISOString(), cid, composed: cid });

		const swept = await reconcile(source, derived, NOW);
		expect(swept.waiting).toHaveLength(0);
		expect((await holders(derived, cid))[0]?.fromKind).toBe('revision');
	});

	it('starts a clock on what nothing names, and does not collect it yet', async () => {
		const cid = await content('c'.repeat(32));

		const swept = await reconcile(source, derived, NOW);
		expect(swept.waiting).toEqual([{ cid, since: NOW.toISOString() }]);
		// Being unreferenced is not being deleted. Twenty-four hours is the whole point.
		expect(swept.collectable).toHaveLength(0);
	});

	it('offers it only once the grace has run out', async () => {
		const cid = await content('d'.repeat(32));
		await reconcile(source, derived, NOW);

		const later = await reconcile(source, derived, LATER);
		expect(later.collectable).toEqual([{ cid, since: NOW.toISOString() }]);
		// The clock is not restarted by a second run, or nothing would ever come due.
		expect(later.waiting[0]?.since).toBe(NOW.toISOString());
	});

	it('clears the clock when something names it again', async () => {
		const cid = await content('e'.repeat(32));
		await reconcile(source, derived, NOW);
		expect(await derived.select().from(derivedSchema.unreferenced)).toHaveLength(1);

		const rid = await resource('t0vau');
		await source
			.insert(schema.resourceContents)
			.values({ resource: rid, cid, slot: 'original', seq: 1 });
		const again = await reconcile(source, derived, LATER);

		expect(again.revived).toEqual([cid]);
		expect(again.collectable).toHaveLength(0);
		expect(await derived.select().from(derivedSchema.unreferenced)).toHaveLength(0);
	});

	it('keeps a derived variant while its original is held, and releases it with the original', async () => {
		const original = await content('f'.repeat(32));
		const variant = await content('0'.repeat(32));
		await source
			.insert(schema.contentDerivations)
			.values({ source: original, cid: variant, format: 'avif', width: 640 });
		const rid = await resource('5pvps');
		await source
			.insert(schema.resourceContents)
			.values({ resource: rid, cid: original, slot: 'original', seq: 1 });

		expect((await reconcile(source, derived, NOW)).waiting).toHaveLength(0);

		// The original stops being held. The variant is named by the derivation alone, which is a
		// fact about the original -- so it has to fall with it rather than keeping it alive.
		await source.delete(schema.resourceContents).where(eq(schema.resourceContents.resource, rid));
		await source.delete(schema.contentDerivations);
		const after = await reconcile(source, derived, NOW);
		expect(after.waiting.map((row) => row.cid).toSorted()).toEqual([variant, original].toSorted());
	});

	it('takes nothing while the grace is running, however often it is asked', async () => {
		const cid = await content('1'.repeat(32));
		const store = memoryStore(new Map([[cid, 'bytes']]));

		expect(await sweep(source, derived, store, NOW)).toEqual([]);
		expect(await sweep(source, derived, store, NOW)).toEqual([]);
		// Still there, and still known: a sweep inside the grace period is a report.
		expect(await source.select().from(schema.contents)).toHaveLength(1);
	});

	it('takes the bytes and the row together, and says so', async () => {
		const cid = await content('2'.repeat(32));
		const store = memoryStore(new Map([[cid, 'bytes']]));
		await reconcile(source, derived, NOW);

		expect(await sweep(source, derived, store, LATER)).toEqual([cid]);
		expect(await source.select().from(schema.contents)).toHaveLength(0);
		await expect(store.read(cid)).rejects.toThrow();
		// The row stays, marked: what a sweep took is the one thing it cannot recompute.
		const [row] = await derived.select().from(derivedSchema.unreferenced);
		expect(row?.collected).toBe(true);
	});

	it('runs twice without failing on bytes the first run already took', async () => {
		const cid = await content('3'.repeat(32));
		const store = memoryStore(new Map([[cid, 'bytes']]));
		await reconcile(source, derived, NOW);
		await sweep(source, derived, store, LATER);
		// Nothing left to find, which a second run must treat as success rather than as absence.
		expect(await sweep(source, derived, store, LATER)).toEqual([]);
	});

	it('rebuilds the table rather than adding to it, so a removed reference is gone', async () => {
		const cid = await content('9'.repeat(32));
		const rid = await resource('28cmp');
		await source
			.insert(schema.resourceContents)
			.values({ resource: rid, cid, slot: 'original', seq: 1 });
		await reconcile(source, derived, NOW);

		await source.delete(schema.resourceContents).where(eq(schema.resourceContents.resource, rid));
		await reconcile(source, derived, NOW);
		expect(await holders(derived, cid)).toHaveLength(0);
	});
});

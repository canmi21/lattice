/**
 * The split the import performs, tested on a corpus small enough to read.
 *
 * What is being held is the rule the schema is built on: a fact that survives new bytes is on the
 * resource, one that does not is on the content. Getting it backwards is silent -- the rows are
 * all there, the counts all match, and a re-scan quietly loses a paid description.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { expect, it } from 'vitest';
import { importRecords } from './import.ts';
import * as schema from './source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGINAL = 'a'.repeat(32);
const VARIANT = 'b'.repeat(32);

function corpus() {
	const repository = mkdtempSync(join(tmpdir(), 'collection-import-'));
	mkdirSync(join(repository, 'data/record'), { recursive: true });
	const write = (name: string, body: string) =>
		writeFileSync(join(repository, 'data/record', name), body);
	write(
		'metadata.json',
		JSON.stringify({
			media: {
				[ORIGINAL]: {
					version: 1,
					resource: 'k7m2x',
					type: 'media.image.photo',
					created: '2026-09-01T00:00:00Z',
					updated: '2026-09-02T00:00:00Z',
					canonical: `cid:${VARIANT}.avif`,
					layers: {
						media: { version: 1, origin: [{ blake3: ORIGINAL, mime: 'image/png', bytes: 10 }] },
						image: {
							version: 1,
							thumbhash: 'abc',
							dimension: { width: 4, height: 3 },
							variants: [{ content: VARIANT, mime: 'image/avif', bytes: 5, quality: 0.7 }],
						},
						photo: { version: 1, lens: '35mm' },
					},
				},
			},
		}),
	);
	write(
		'media.yaml',
		stringify({
			version: 2,
			media: {
				[ORIGINAL]: {
					description: { 'en-US': { text: 'a lens cap', provider: 'openai', tokens: 12 } },
					category: 'photograph',
					tags: ['camera'],
				},
			},
		}),
	);
	write(
		'tags.yaml',
		stringify({ version: 3, tags: { camera: { kind: 'ordinary', display: 'Camera' } } }),
	);
	return repository;
}

function imported() {
	const database = drizzle(new Database(':memory:'), { schema });
	migrate(database, { migrationsFolder: resolve(HERE, '../drizzle/source') });
	importRecords(database, corpus());
	return database;
}

it('puts what survives new bytes on the resource and what does not on the content', async () => {
	const database = imported();
	const rows = await database.select().from(schema.resources);
	const resource = rows[0]!;
	const layers = resource.layers as Record<string, unknown>;
	// The camera is a fact about these bytes; a re-scan measures its own.
	expect(layers).not.toHaveProperty('photo');
	expect(layers).not.toHaveProperty('image');
	const stored = await database.select().from(schema.contents);
	const original = stored.find((row) => row.cid === ORIGINAL)!;
	const bytes = original.layers as Record<string, Record<string, unknown>>;
	expect(bytes).toHaveProperty('photo');
	expect(bytes.image!.thumbhash).toBe('abc');
	// The description is about the subject, so it is the resource's and survives new bytes.
	const said = await database.select().from(schema.texts);
	expect(said[0]!.ownerId).toBe('k7m2x');
	expect(said[0]!.tokens).toBe(12);
});

it('makes a variant a content of its own, named by what it was derived from', async () => {
	const database = imported();
	const derivations = await database.select().from(schema.contentDerivations);
	expect(derivations[0]).toMatchObject({ source: ORIGINAL, cid: VARIANT, format: 'image/avif' });
	const held = await database.select().from(schema.resourceContents);
	// Only the original is held as a slot: a variant is reached through what it came from.
	expect(held).toHaveLength(1);
	expect(held[0]!).toMatchObject({ slot: 'original', seq: 1, cid: ORIGINAL });
});

it('runs twice with the same result, because it empties what it fills', async () => {
	const database = imported();
	const before = await database.select().from(schema.resources);
	importRecords(database, corpus());
	expect(await database.select().from(schema.resources)).toEqual(before);
});

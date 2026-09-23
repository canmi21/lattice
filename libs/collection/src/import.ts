/**
 * The one pass that moves the committed records into the authored database.
 *
 * Three files go in -- the merged manifest, the curated media record and the tag registry -- and
 * what comes out is rows split by the question the schema is built on: a fact that survives new
 * bytes lands on the resource, one that does not lands on the content. It reads and never writes
 * them, so running it twice is the same as running it once: every insert replaces its own row.
 */
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	contentDerivations,
	contents,
	media,
	resourceContents,
	resources,
	resourceTags,
	tags,
	texts,
} from './source.ts';
import type { SourceDatabase } from './open.ts';

/** Layers that describe the thing, and therefore stay with the resource. */
const OF_THE_THING: Record<string, readonly string[]> = {
	media: ['version'],
	icon: ['version', 'domain'],
	frame: ['version', 'source'],
	video: ['version', 'cover'],
	clip: ['version'],
};

/** Layers that describe one original's bytes, and therefore travel with the content. */
const OF_THE_BYTES: Record<string, readonly string[]> = {
	image: ['version', 'thumbhash', 'placeholder', 'dimension', 'resolution'],
	photo: ['*'],
	screenshot: ['*'],
	video: ['version', 'source'],
};

type Layers = Record<string, Record<string, unknown>>;

function take(layers: Layers, wanted: Record<string, readonly string[]>): Layers {
	const out: Layers = {};
	for (const [name, body] of Object.entries(layers)) {
		const fields = wanted[name];
		if (!fields) continue;
		out[name] =
			fields[0] === '*'
				? body
				: Object.fromEntries(Object.entries(body).filter(([key]) => fields.includes(key)));
	}
	return out;
}

type Origin = { blake3: string; mime: string; bytes: number };
type Variant = {
	content: string;
	mime: string;
	bytes: number;
	resolution?: { width: number };
	quality?: number;
};
type Record_ = {
	resource: string;
	type: string;
	created: string;
	updated: string;
	canonical?: string;
	layers: Layers;
};

/** Every record in the manifest, as resources, contents and the links between them. */
function importManifest(database: SourceDatabase, manifest: { media: Record<string, Record_> }) {
	const byOrigin = new Map<string, string>();
	for (const record of Object.values(manifest.media)) {
		const origins = (record.layers.media?.origin ?? []) as Origin[];
		database
			.insert(resources)
			.values({
				id: record.resource,
				type: record.type,
				created: record.created,
				updated: record.updated,
				canonical: record.canonical ?? null,
				layers: take(record.layers, OF_THE_THING),
			})
			.run();

		// The bytes-level layers describe the newest original, so only it carries them.
		origins.forEach((origin, index) => {
			const newest = index === origins.length - 1;
			byOrigin.set(origin.blake3, record.resource);
			addContent(
				database,
				origin.blake3,
				origin.mime,
				origin.bytes,
				record.created,
				newest ? take(record.layers, OF_THE_BYTES) : {},
			);
			database
				.insert(resourceContents)
				.values({ resource: record.resource, cid: origin.blake3, slot: 'original', seq: index + 1 })
				.run();
		});

		const original = origins.at(-1)?.blake3;
		const variants = [
			...((record.layers.image?.variants ?? []) as Variant[]),
			...((record.layers.video?.variants ?? []) as Variant[]),
		];
		for (const variant of variants) {
			addContent(database, variant.content, variant.mime, variant.bytes, record.created, {});
			if (!original) continue;
			database
				.insert(contentDerivations)
				.values({
					source: original,
					cid: variant.content,
					format: variant.mime,
					width: variant.resolution?.width ?? null,
					quality: variant.quality ?? null,
				})
				.run();
		}

		// An icon is one thing and two files, which is what the slots are for.
		const tones = (record.layers.icon?.tones ?? {}) as Record<string, Origin & { content: string }>;
		for (const [tone, file] of Object.entries(tones)) {
			addContent(database, file.content, file.mime, file.bytes, record.created, {});
			database
				.insert(resourceContents)
				.values({ resource: record.resource, cid: file.content, slot: tone, seq: 1 })
				.run();
		}
	}
	return byOrigin;
}

/** One row per cid, because two resources can name the same bytes and often do. */
const seen = new Set<string>();

function addContent(
	database: SourceDatabase,
	cid: string,
	mime: string,
	bytes: number,
	created: string,
	layers: Layers,
) {
	if (seen.has(cid)) return;
	seen.add(cid);
	database.insert(contents).values({ cid, mime, bytes, created, layers }).run();
}

type Described = {
	description?: Record<string, { text: string } & Record<string, unknown>>;
	category?: string;
	tags?: string[];
	source?: { url: string; label?: string };
	excerpt?: string;
};

/** The curated record, which is keyed by an original's cid and belongs to that original's thing. */
function importMedia(
	database: SourceDatabase,
	file: { media: Record<string, Described> },
	byOrigin: Map<string, string>,
	registered: Set<string>,
) {
	let orphans = 0;
	for (const [cid, entry] of Object.entries(file.media)) {
		const resource = byOrigin.get(cid);
		if (!resource) {
			orphans += 1;
			continue;
		}
		database
			.insert(media)
			.values({
				resource,
				category: entry.category ?? null,
				sourceUrl: entry.source?.url ?? null,
				sourceLabel: entry.source?.label ?? null,
				excerpt: entry.excerpt ?? null,
			})
			.run();
		for (const [locale, said] of Object.entries(entry.description ?? {})) {
			addText(database, 'resource', resource, 'description', locale, said);
		}
		for (const tag of entry.tags ?? []) {
			// A picture may name a tag the registry has not caught up with; the link is the fact
			// here, so the registry gets a bare row rather than the link being dropped.
			if (!registered.has(tag)) {
				database.insert(tags).values({ name: tag, kind: 'ordinary' }).run();
				registered.add(tag);
			}
			database.insert(resourceTags).values({ resource, tag }).run();
		}
	}
	return orphans;
}

type Told = {
	text: string;
	provider?: string;
	model?: string;
	at?: string;
	seconds?: number;
	tokens?: number;
	review?: boolean;
};

function addText(
	database: SourceDatabase,
	ownerKind: string,
	ownerId: string,
	field: string,
	locale: string,
	said: Told,
) {
	const row = {
		ownerKind,
		ownerId,
		field,
		locale,
		body: said.text,
		provider: said.provider ?? null,
		model: said.model ?? null,
		at: said.at ?? null,
		seconds: said.seconds ?? null,
		tokens: said.tokens ?? null,
		review: said.review ?? false,
	};
	database.insert(texts).values(row).run();
}

type Tag = {
	kind: string;
	meaning?: string;
	source?: string;
	display?: string | Record<string, Told>;
};

/** The registry. A label that was translated is rows in `text`; one that was not is a column. */
function importTags(database: SourceDatabase, file: { tags: Record<string, Tag> }) {
	const registered = new Set<string>();
	for (const [name, tag] of Object.entries(file.tags)) {
		registered.add(name);
		const plain = typeof tag.display === 'string' ? tag.display : null;
		database
			.insert(tags)
			.values({
				name,
				kind: tag.kind,
				meaning: tag.meaning ?? null,
				source: tag.source ?? null,
				display: plain,
			})
			.run();
		if (plain !== null || !tag.display) continue;
		for (const [locale, said] of Object.entries(tag.display)) {
			addText(database, 'tag', name, 'display', locale, said);
		}
	}
	return registered;
}

/**
 * One transaction, over tables this pass empties first.
 *
 * Emptying rather than reconciling, because this is a migration and not a sync: the files are the
 * only source there is until they retire, so the database is whatever they say this time. The
 * order is children before parents, which is the order the foreign keys demand.
 */
export function importRecords(database: SourceDatabase, repository: string) {
	const read = (name: string) => readFileSync(resolve(repository, 'data/record', name), 'utf8');
	return database.transaction((tx) => {
		seen.clear();
		for (const table of [resourceTags, texts, contentDerivations, resourceContents, media]) {
			tx.delete(table).run();
		}
		tx.delete(tags).run();
		tx.delete(contents).run();
		tx.delete(resources).run();
		const byOrigin = importManifest(tx, JSON.parse(read('metadata.json')));
		const registered = importTags(tx, parse(read('tags.yaml')));
		const orphans = importMedia(tx, parse(read('media.yaml')), byOrigin, registered);
		return { contents: seen.size, orphans };
	});
}

/**
 * What the translation sidecars hold, and where each piece would land. Read-only.
 *
 * A survey rather than an importer, because the shape it reports is the thing to agree on first:
 * a sidecar keys a translation by the hash of the sentence, not by the article, so the same
 * sentence written twice is translated once. That is worth keeping -- the money was spent per
 * segment -- and it is why these rows are owned by a segment rather than by a rid. "One rid over
 * every language" is about the article having one identity across its nine views, which it
 * already does; the segments underneath are shared on purpose. See spec/todo/milestones.md, A7.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { texts } from './source.ts';
import type { SourceDatabase } from './open.ts';

/** One translated segment, as a row would hold it. */
export type Translated = {
	ownerKind: 'segment';
	ownerId: string;
	field: 'text';
	locale: string;
	body: string;
	provider: string | null;
	model: string | null;
	at: string | null;
	seconds: number | null;
	tokens: number | null;
	review: boolean;
};

type Sidecar = {
	version?: number;
	segments?: Record<string, Record<string, Record<string, unknown>>>;
};

export const SIDECAR_VERSION = 1;

function sidecars(contents: string): string[] {
	const found: string[] = [];
	const walk = (directory: string) => {
		for (const entry of readdirSync(directory)) {
			const path = join(directory, entry);
			if (statSync(path).isDirectory()) walk(path);
			else if (entry.endsWith('.i18n.yaml')) found.push(path);
		}
	};
	walk(contents);
	return found.sort();
}

export type Survey = {
	files: { file: string; segments: number; locales: number }[];
	rows: Translated[];
	/** Segments more than one article carries, which is the sharing that keying by hash buys. */
	shared: { segment: string; files: string[] }[];
	/** Rows the collection already holds under the same key, which an import would overwrite. */
	colliding: string[];
	/** Anything the sidecars say that these columns have nowhere to put. */
	unmapped: string[];
};

/** Read every sidecar and say what importing it would write, without writing any of it. */
export async function survey(database: SourceDatabase, contents: string): Promise<Survey> {
	const files: Survey['files'] = [];
	const rows: Translated[] = [];
	const seen = new Map<string, Set<string>>();
	const unmapped = new Set<string>();

	for (const file of sidecars(contents)) {
		const parsed = (parse(readFileSync(file, 'utf8')) ?? {}) as Sidecar;
		if (parsed.version !== SIDECAR_VERSION) {
			unmapped.add(`${relative(contents, file)}: version ${String(parsed.version)}`);
		}
		const segments = parsed.segments ?? {};
		const locales = new Set<string>();
		for (const [segment, byLocale] of Object.entries(segments)) {
			seen.set(segment, (seen.get(segment) ?? new Set()).add(relative(contents, file)));
			for (const [locale, held] of Object.entries(byLocale)) {
				locales.add(locale);
				for (const key of Object.keys(held)) {
					if (!['text', 'provider', 'model', 'at', 'seconds', 'tokens', 'review'].includes(key)) {
						unmapped.add(`${relative(contents, file)}: ${key}`);
					}
				}
				rows.push({
					ownerKind: 'segment',
					ownerId: segment,
					field: 'text',
					locale,
					body: String(held.text ?? ''),
					provider: (held.provider as string) ?? null,
					model: (held.model as string) ?? null,
					at: (held.at as string) ?? null,
					seconds: (held.seconds as number) ?? null,
					tokens: (held.tokens as number) ?? null,
					review: held.review === true,
				});
			}
		}
		files.push({
			file: relative(contents, file),
			segments: Object.keys(segments).length,
			locales: locales.size,
		});
	}

	const held = await database
		.select({ ownerKind: texts.ownerKind, ownerId: texts.ownerId, locale: texts.locale })
		.from(texts);
	const existing = new Set(held.map((row) => `${row.ownerKind}/${row.ownerId}/${row.locale}`));

	return {
		files,
		rows,
		shared: [...seen]
			.filter(([, where]) => where.size > 1)
			.map(([segment, where]) => ({ segment, files: [...where] })),
		colliding: rows
			.map((row) => `${row.ownerKind}/${row.ownerId}/${row.locale}`)
			.filter((key) => existing.has(key)),
		unmapped: [...unmapped],
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { dirname, resolve } = await import('node:path');
	const { fileURLToPath } = await import('node:url');
	const { openSource, SOURCE_FILE } = await import('./open.ts');
	const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
	const database = openSource(join(repository, SOURCE_FILE));
	const found = await survey(database, join(repository, 'contents'));

	for (const { file, segments, locales } of found.files) {
		console.log(`  ${file}: ${segments} segments x ${locales} locales`);
	}
	const unique = new Set(found.rows.map((row) => row.ownerId)).size;
	const locales = new Set(found.rows.map((row) => row.locale));
	console.log(
		`\n${found.rows.length} rows, ${unique} distinct segments, ${locales.size} locales ` +
			`(${[...locales].toSorted().join(' ')})`,
	);
	console.log(`${found.shared.length} segments carried by more than one article`);
	console.log(`${found.colliding.length} would overwrite a row the collection already holds`);
	if (found.unmapped.length > 0) console.log(`unmapped: ${found.unmapped.join(', ')}`);
	console.log('\nnothing was written');
}

/**
 * The corpus as it stands, moved into the collection: nine articles, six of them published.
 *
 * The gate this opens is `created`. A date a person typed is normally something the collection
 * refuses, because an identity is created when it is created here -- but these nine existed
 * before there was anywhere honest to record that, and their frontmatter is the only witness. The
 * importer is the gate, so it closes by there being no other way in: nothing else writes `created`.
 */
import { inArray, isNull, like, or } from 'drizzle-orm';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { ARTICLE_TYPE, PAGE_TYPE, type DraftMeta } from './article.ts';
import { allocate } from './allocate.ts';
import { contents, documents, drafts, paths, resources, revisions } from './source.ts';
import type { SourceDatabase } from './open.ts';

type Frontmatter = {
	title?: string;
	subtitle?: string;
	description?: string;
	lang?: string;
	draft?: boolean | string;
	created?: string;
	published?: string;
};

/**
 * Everything this pass wrote last time, so that running it twice writes the same rows once.
 *
 * Only what documents own: the media a separate pass imported keeps its resources, and the ids it
 * granted stay granted. Children before parents, which is what the foreign keys require.
 */
async function clear(database: SourceDatabase) {
	const rows = await database
		.select({ id: resources.id })
		.from(resources)
		.where(or(like(resources.type, 'document%'), isNull(resources.type)));
	const held = rows.map((row) => row.id);
	if (held.length === 0) return;
	database.delete(revisions).where(inArray(revisions.resource, held)).run();
	database.delete(paths).where(inArray(paths.resource, held)).run();
	database.delete(documents).where(inArray(documents.resource, held)).run();
	database.delete(drafts).where(inArray(drafts.resource, held)).run();
	database.delete(resources).where(inArray(resources.id, held)).run();
}

/** The published object's key is this digest, which `.mise/tasks/content-id.mjs` also computes. */
function contentId(body: string): string {
	return bytesToHex(blake3(new TextEncoder().encode(body), { dkLen: 16 }));
}

function markdownFiles(root: string): string[] {
	const found: string[] = [];
	const walk = (directory: string) => {
		for (const entry of readdirSync(directory)) {
			const path = join(directory, entry);
			if (statSync(path).isDirectory()) walk(path);
			else if (entry.endsWith('.md')) found.push(path);
		}
	};
	walk(root);
	return found.sort();
}

function split(source: string): { frontmatter: Frontmatter; body: string } {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
	if (!match) return { frontmatter: {}, body: source };
	return {
		frontmatter: (parse(match[1]!) ?? {}) as Frontmatter,
		body: source.slice(match[0].length),
	};
}

function metaOf(frontmatter: Frontmatter, path: string): DraftMeta {
	return {
		title: frontmatter.title,
		subtitle: frontmatter.subtitle,
		description: frontmatter.description,
		language: frontmatter.lang,
		path,
	};
}

/**
 * Each file becomes an identity, and what it becomes after that depends on one question.
 *
 * Published articles take the type, an address, a content and a first revision dated by their
 * frontmatter; unpublished ones take a draft row and nothing else, because what makes an article
 * published is that a revision exists. The flag is read here for the last time: after this the
 * state is counted rather than declared.
 */
export async function importArticles(database: SourceDatabase, repository: string) {
	const root = resolve(repository, 'contents');
	await clear(database);
	let published = 0;
	let drafted = 0;
	for (const file of markdownFiles(root)) {
		const source = readFileSync(file, 'utf8');
		const { frontmatter, body } = split(source);
		const path = relative(root, file).replace(/\.md$/, '');
		// A file at the top of `contents` is the standalone page, which is a document and stops
		// there: resource.md refuses a `page` layer, because it would be a name carrying no fields.
		const type = path.includes('/') ? ARTICLE_TYPE : PAGE_TYPE;
		const isDraft = String(frontmatter.draft ?? '').trim() === 'true';
		const created = frontmatter.created ?? new Date().toISOString();
		const id = await allocate(database);

		database
			.insert(resources)
			.values({
				id,
				type: isDraft ? null : type,
				created,
				updated: created,
				layers: isDraft ? {} : { article: { version: 1, ...metaOf(frontmatter, path) } },
			})
			.run();

		if (isDraft) {
			database
				.insert(drafts)
				.values({ resource: id, body, meta: metaOf(frontmatter, path), created, updated: created })
				.run();
			drafted += 1;
			continue;
		}

		const cid = contentId(body);
		// The same bytes are the same row by definition, so an existing one is already right.
		database
			.insert(contents)
			.values({ cid, mime: 'text/markdown', bytes: body.length, created, layers: {} })
			.onConflictDoNothing()
			.run();
		database
			.insert(documents)
			.values({ resource: id, sourceFile: relative(repository, file) })
			.run();
		database.insert(paths).values({ resource: id, path, since: created }).run();
		database
			.insert(revisions)
			.values({ resource: id, seq: 1, at: frontmatter.published ?? created, cid, composed: cid })
			.run();
		published += 1;
	}
	return { published, drafted };
}

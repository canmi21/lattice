/**
 * Reading and setting what an article is, now that it is rows rather than frontmatter.
 *
 * This exists because of the rule A5 sets itself: metadata may not leave the text until there is
 * a way to edit it where it landed. The editor is that way for the fields it shows; this is the
 * way for the rest, and for a machine with no browser. See spec/todo/milestones.md.
 *
 * Every field here is one place. The layer holds what the article is, `path` holds where it
 * answers, and the two dates a reader is shown are the ends of the revision chain and are stored
 * nowhere -- so this reports them and refuses to set them, which `retime` does instead.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import * as v from 'valibot';
import { articleMeta, type ArticleMeta } from './article.ts';
import { address, paths, place, resources, revisions } from './source.ts';
import { articleLayers } from './revise.ts';
import type { SourceDatabase } from './open.ts';

/** What an article is, as one record, whichever table each part of it came out of. */
export type Metadata = {
	resource: string;
	type: string | null;
	created: string;
	updated: string;
	path: string | undefined;
	/** The ends of the chain. Absent together, because an article with no revision is a draft. */
	published: string | undefined;
	lastmod: string | undefined;
	/** Whether the publication's moment has been settled. See revise.ts, `lockTime`. */
	locked: boolean;
	layer: Partial<ArticleMeta>;
};

export async function read(database: SourceDatabase, rid: string): Promise<Metadata | undefined> {
	const [resource] = await database.select().from(resources).where(eq(resources.id, rid));
	if (!resource) return undefined;

	const [current] = await database
		.select()
		.from(paths)
		.where(and(eq(paths.resource, rid), isNull(paths.until)));
	const chain = await database
		.select({ seq: revisions.seq, at: revisions.at, atLocked: revisions.atLocked })
		.from(revisions)
		.where(eq(revisions.resource, rid))
		.orderBy(asc(revisions.seq));

	const layers = resource.layers as { article?: Partial<ArticleMeta> };
	return {
		resource: resource.id,
		type: resource.type,
		created: resource.created,
		updated: resource.updated,
		path: current ? address(current) : undefined,
		published: chain[0]?.at,
		// Not a stored field. What a reader would see as an update is the newest revision's
		// moment, so an article with one revision was last modified when it was published.
		lastmod: chain[chain.length - 1]?.at,
		locked: chain[0]?.atLocked ?? false,
		layer: layers.article ?? {},
	};
}

/** Fields of the `article` layer this may set, which is every field the layer has. */
export type Editable = Partial<Omit<ArticleMeta, 'path'>>;

/**
 * Change what an article says about itself, one field at a time and never by replacing the layer.
 *
 * A caller that passes one field must not clear the others, which is the mistake a whole-object
 * write makes silently. The layer is read, merged and written back, and the result is parsed --
 * so a set that would leave an article unable to describe itself fails here rather than at the
 * next publish.
 */
export async function set(
	database: SourceDatabase,
	rid: string,
	fields: Editable,
): Promise<ArticleMeta> {
	const held = await read(database, rid);
	if (!held) throw new Error(`no resource ${rid}`);

	const merged = { ...held.layer, ...fields, path: held.path ?? '' };
	const parsed = v.safeParse(articleMeta, merged);
	if (!parsed.success) {
		const missing = parsed.issues.map((issue) => v.getDotPath(issue) ?? '(the record)');
		throw new Error(`${rid} would be left without: ${missing.join(', ')}`);
	}

	await database
		.update(resources)
		.set({ layers: articleLayers(parsed.output), updated: new Date().toISOString() })
		.where(eq(resources.id, rid));
	return parsed.output;
}

/**
 * Move an article, keeping where it used to answer from.
 *
 * The old row is closed rather than overwritten: that table is the redirect history, and an
 * address nothing remembers is a link somebody else wrote that now goes nowhere.
 */
export async function move(database: SourceDatabase, rid: string, to: string): Promise<void> {
	const at = new Date().toISOString();
	await database
		.update(paths)
		.set({ until: at })
		.where(and(eq(paths.resource, rid), isNull(paths.until)));
	await database.insert(paths).values({ resource: rid, ...place(to), since: at });
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { dirname, join, resolve } = await import('node:path');
	const { fileURLToPath } = await import('node:url');
	const { openSource, SOURCE_FILE } = await import('./open.ts');
	const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
	const database = openSource(join(repository, SOURCE_FILE));

	const [rid, ...rest] = process.argv.slice(2);
	if (!rid) {
		console.error('usage: meta <rid> [field=value ...] [--move <path>]');
		process.exit(2);
	}

	const moveAt = rest.indexOf('--move');
	if (moveAt !== -1) {
		const to = rest[moveAt + 1];
		if (!to) throw new Error('--move needs an address');
		await move(database, rid, to);
		rest.splice(moveAt, 2);
	}

	const fields = Object.fromEntries(
		rest.map((pair) => {
			const cut = pair.indexOf('=');
			if (cut === -1) throw new Error(`not a field: ${pair}`);
			return [pair.slice(0, cut), pair.slice(cut + 1)];
		}),
	) as Editable;
	if (Object.keys(fields).length > 0) await set(database, rid, fields);

	const held = await read(database, rid);
	if (!held) throw new Error(`no resource ${rid}`);
	console.log(JSON.stringify(held, null, '\t'));
}

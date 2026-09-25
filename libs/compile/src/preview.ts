/**
 * Compiling one draft, for a reader who has not published it yet.
 *
 * The same `compile` the publish pass runs -- what differs is only how much is assembled around
 * it. A preview is the source view alone: no translations, no sidecars, no second pass. So the
 * reference map here is built from source frontmatter and covers one locale, where the build
 * covers nine. Nothing about the markdown rules is restated; this module assembles a context and
 * calls the one implementation. See spec/todo/milestones.md, B3a.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
	ArticleReference,
	Compiled,
	CrateRecord,
	RepoRecord,
	TweetRecord,
} from '@canmi/artifacts/types';
import { URLS } from '@canmi/urls';
import {
	createAssetResolver,
	createDiagramResolver,
	createIconResolver,
	createVideoResolver,
	readAssets,
	type DiagramStore,
	type MediaManifest,
} from './assets.ts';
import { namedResources, parseResource, type ParsedResource } from '@canmi/artifacts';
import { articleFrontmatter, compile } from './compile.ts';
import { articlePath, newTabNotes, sourceLocale } from './articles.ts';
import { highlight } from './highlight.ts';

export type PreviewPaths = {
	contents: string;
	cdnUrl: string;
	messages: string;
	assets: string;
	media: string;
	diagrams: string;
	crates: string;
	repos: string;
	tweets: string;
	/** The published records, which is where a rid's current shape is written. */
	records: string;
};

/**
 * The records the blocks name, read where publication already wrote them.
 *
 * A block carries a rid and the page resolves it -- that is resource.md's rule and the reason a
 * re-derived picture does not republish the article. So a preview has to resolve them too, and
 * the honest place to read them from is the tree the site itself is served from.
 *
 * A rid nothing has published is skipped rather than fatal: it is a picture the author has not
 * imported yet, which is an ordinary state while writing.
 */
export async function previewResources(
	records: string,
	blocks: readonly Parameters<typeof namedResources>[0][number][],
): Promise<Record<string, ParsedResource>> {
	const found: Record<string, ParsedResource> = {};
	for (const rid of namedResources(blocks)) {
		const raw = await readFile(join(records, `${rid}.json`), 'utf8').catch(() => '');
		if (raw) found[rid] = parseResource(JSON.parse(raw));
	}
	return found;
}

/** Every `::article` card's target, read from source frontmatter alone. */
async function references(contents: string): Promise<Record<string, ArticleReference>> {
	const found: Record<string, ArticleReference> = {};
	for (const category of await readdir(contents, { withFileTypes: true })) {
		if (!category.isDirectory()) continue;
		const directory = join(contents, category.name);
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
			const file = join(directory, entry.name);
			const raw = await readFile(file, 'utf8');
			const { title, subtitle, published } = articleFrontmatter(raw, file);
			// A short form is asked for rather than written -- it lives in the segment layout, and
			// a view nothing has written one for falls back to the full form. A preview is that
			// state by construction. See spec/i18n/prose.md.
			found[articlePath(contents, file)] = {
				title,
				subtitle,
				published,
				short_title: title,
				short_subtitle: subtitle,
			};
		}
	}
	return found;
}

/** A JSON file whose absence is a working state rather than an error. */
async function optional<T>(file: string, empty: T): Promise<T> {
	return JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) ?? empty;
}

/** What the draft holds, which is the two halves the collection stores apart. */
export type PreviewDraft = {
	body: string;
	language: string;
	path: string;
	title?: string;
	subtitle?: string;
	description?: string;
	created?: string;
	updated?: string;
};

/**
 * The two halves, rejoined, because the compiler's input is markdown carrying its frontmatter.
 *
 * The collection stores the text and its metadata apart -- which is the point of A5 -- so this
 * is the seam arriving early: the preview writes the block the compiler expects to find rather
 * than the compiler learning a second input shape.
 */
function withFrontmatter(draft: PreviewDraft): string {
	const now = new Date().toISOString();
	const front = {
		title: draft.title ?? 'Untitled',
		subtitle: draft.subtitle ?? '',
		description: draft.description ?? '',
		lang: draft.language,
		created: draft.created ?? now,
		published: draft.created ?? now,
		lastmod: draft.updated ?? now,
	};
	return `---\n${stringifyYaml(front)}---\n\n${draft.body}`;
}

/**
 * The draft as the site would render it: the blocks, and nothing about where they will live.
 *
 * `language` is the article's own, because an image's description is read beside prose in the
 * language the prose is written in -- the same argument the build makes for the source view.
 */
export async function compileDraft(paths: PreviewPaths, draft: PreviewDraft): Promise<Compiled> {
	const notes = await newTabNotes(paths.messages);
	const assets = readAssets(JSON.parse(await readFile(paths.assets, 'utf8')));
	const media = (parseYaml(await readFile(paths.media, 'utf8')) ?? { media: {} }) as MediaManifest;
	const drawings = await optional<DiagramStore>(paths.diagrams, { diagrams: {} } as DiagramStore);
	const locale = sourceLocale(draft.language);
	const embeds = {
		crates:
			(await optional<{ crates?: Record<string, CrateRecord> }>(paths.crates, {})).crates ?? {},
		repos: (await optional<{ repos?: Record<string, RepoRecord> }>(paths.repos, {})).repos ?? {},
		tweets:
			(await optional<{ tweets?: Record<string, TweetRecord> }>(paths.tweets, {})).tweets ?? {},
	};

	return compile(withFrontmatter(draft), `${URLS.apps.production.site}/${draft.path}`, {
		newTabNote: notes.mw,
		resolveAsset: createAssetResolver(assets, media, paths.cdnUrl, locale),
		resolveIcon: createIconResolver(assets),
		resolveVideo: createVideoResolver(assets, media, paths.cdnUrl, locale),
		describeDiagram: createDiagramResolver(drawings, locale),
		articles: await references(paths.contents),
		highlight,
		sourceFile: draft.path,
		embeds,
	});
}

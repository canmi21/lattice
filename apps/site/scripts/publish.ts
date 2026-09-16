/**
 * Compile the corpus and write every published object, then the root that names them.
 *
 * This is what the site's build used to do in-process. It no longer does: the site is rebuilt
 * when its own code changes, and the corpus is published on its own schedule from here.
 * See spec/architecture/artifacts.md.
 */
import { mkdir, readdir, readlink, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
	ARTIFACT_TYPES,
	ARTIFACT_VERSION,
	artifactKey,
	ROOT_KEY,
	type ArtifactType,
	type PublishedPage,
	type PublishedView,
	type Root,
	type RootArticle,
	type RootView,
} from '@canmi/artifacts';
import type { Article, Page } from '@canmi/artifacts/types';
import { URLS } from '@canmi/urls';
import { buildArticles, buildPages } from '../src/lib/content/build/articles.ts';
import { readSiteFacts, type SiteFacts } from '../src/lib/content/publish/config.ts';
import { buildFeed } from '../src/lib/content/publish/feed.ts';
import { buildLlms } from '../src/lib/content/publish/llms.ts';
import { LOCALE_CODES } from '../src/lib/locale/index.ts';

const ROOT = new URL('../../../', import.meta.url);
const SITE = new URL('apps/site/', ROOT);

/**
 * The corpus compiler's inputs, which are the ones vite.config.ts passes.
 *
 * Production addresses in both trees: an object names where its assets actually live, and the
 * draft tree is a preview of what publishing this corpus would produce rather than a corpus of
 * its own.
 */
const INPUTS = {
	contents: fileURLToPath(new URL('contents', ROOT)),
	cdnUrl: URLS.apps.production.cdn,
	messages: fileURLToPath(new URL('messages', SITE)),
	assets: fileURLToPath(new URL('data/metadata.json', ROOT)),
	media: fileURLToPath(new URL('data/media.yaml', ROOT)),
	diagrams: fileURLToPath(new URL('data/diagram.json', ROOT)),
	segments: fileURLToPath(new URL('data/build/segments.json', ROOT)),
	crates: fileURLToPath(new URL('data/build/crates.json', ROOT)),
	repos: fileURLToPath(new URL('data/build/repos.json', ROOT)),
	tweets: fileURLToPath(new URL('data/build/twitter.json', ROOT)),
};

type Tally = { written: number; present: number; bytes: number };

/** One tree of objects on disk, addressed exactly as the bucket addresses them. */
class Tree {
	readonly #dir: string;
	readonly #made = new Set<string>();
	readonly tally: Tally = { written: 0, present: 0, bytes: 0 };

	constructor(dir: string) {
		this.#dir = dir;
	}

	/** Write one immutable object and answer the hash the root names it by. */
	async put(type: ArtifactType, body: string): Promise<string> {
		const bytes = Buffer.from(body, 'utf8');
		const digest = bytesToHex(blake3(bytes, { dkLen: 16 }));
		const file = join(this.#dir, artifactKey(type, digest));
		// A content-addressed key cannot denote different bytes, so a file already there is this
		// file. Nothing is compared and nothing is swept: see spec/architecture/artifacts.md,
		// "Publication is ordered, and deletion is not part of it".
		if (await this.#exists(file)) {
			this.tally.present += 1;
			return digest;
		}
		await this.#write(file, bytes);
		return digest;
	}

	/** Write the root, which is the one name in the tree whose bytes change under it. */
	async putRoot(root: Root): Promise<void> {
		await this.#write(join(this.#dir, ROOT_KEY), Buffer.from(JSON.stringify(root), 'utf8'));
	}

	async #exists(file: string): Promise<boolean> {
		return stat(file).then(
			() => true,
			() => false,
		);
	}

	async #write(file: string, bytes: Buffer): Promise<void> {
		const directory = dirname(file);
		if (!this.#made.has(directory)) {
			await mkdir(directory, { recursive: true });
			this.#made.add(directory);
		}
		await writeFile(file, bytes);
		this.tally.written += 1;
		this.tally.bytes += bytes.byteLength;
	}
}

/**
 * The opening prose the homepage card draws its body bars from.
 *
 * Carried in the root so listing every article costs one request. The derivation is the
 * homepage load's, verbatim, because two spellings of it would show two different cards.
 */
function paragraphs(text: string): string[] {
	return text
		.split('\n\n')
		.map((p) => p.trim())
		.filter((p) => p.length > 16)
		.slice(0, 3)
		.map((p) => p.slice(0, 140));
}

async function publishArticle(tree: Tree, article: Article): Promise<RootArticle> {
	const views: RootArticle['views'] = {};
	for (const code of LOCALE_CODES) {
		const view = article.views[code];
		const published: PublishedView = {
			version: ARTIFACT_VERSION,
			// The article's own path, not a requested one: it is what the read counter is keyed
			// by on the API side, and the two lists have to name the same thing.
			slug: article.path,
			locale: code,
			meta: view.meta,
			phoneTitle: view.phoneTitle,
			toc: view.toc,
			blocks: view.blocks,
			summary: view.summary,
			words: view.words,
			languageTag: view.languageTag,
			canonical: view.canonical,
			translationAvailable: view.translationAvailable,
			alternates: article.alternates,
		};
		views[code] = {
			content: await tree.put('content', JSON.stringify(published)),
			title: view.meta.title,
			subtitle: view.meta.subtitle,
			description: view.meta.description,
			shortTitle: view.short.title,
			shortSubtitle: view.short.subtitle,
			created: view.meta.created,
			lastmod: view.meta.lastmod,
			languageTag: view.languageTag,
			canonical: view.canonical,
			translationAvailable: view.translationAvailable,
			words: view.words,
			paragraphs: paragraphs(view.text),
		} satisfies RootView;
	}
	return {
		path: article.path,
		url: article.url,
		markdown: await tree.put('markdown', article.markdown),
		alternates: article.alternates,
		canonicalUrls: article.canonicalUrls,
		views,
	};
}

/**
 * Every locale still gets an entry, and they all name the same object.
 *
 * A page is compiled once and filed under every locale, and its envelope carries no locale to
 * tell the copies apart, so the nine bodies are one body. The root names a hash per locale
 * because the API answers per locale; the tree writes the object once because it is one object.
 */
async function publishPage(tree: Tree, page: Page): Promise<Root['pages'][string]> {
	const views: Root['pages'][string]['views'] = {};
	for (const code of LOCALE_CODES) {
		const view = page.views[code];
		const published: PublishedPage = {
			version: ARTIFACT_VERSION,
			slug: page.path,
			meta: view.meta,
			blocks: view.blocks,
		};
		views[code] = { content: await tree.put('page', JSON.stringify(published)) };
	}
	return { markdown: await tree.put('markdown', page.markdown), views };
}

async function publishCorpus(
	dir: string,
	articles: Article[],
	pages: Page[],
	site: SiteFacts,
): Promise<Tally> {
	const tree = new Tree(dir);
	const rootArticles: RootArticle[] = [];
	for (const article of articles) rootArticles.push(await publishArticle(tree, article));
	const rootPages: Root['pages'] = {};
	for (const page of pages) rootPages[page.path] = await publishPage(tree, page);
	const feeds: Root['feeds'] = {};
	for (const code of LOCALE_CODES) {
		feeds[code] = await tree.put('feed', buildFeed(articles, code, site));
	}
	const llms = await tree.put('llms', buildLlms(articles, site));
	// Last, and only once every object it names is on disk. A root that arrives first names
	// objects that answer 404, and a 404 on a content-addressed key is the one answer this
	// design cannot afford to have cached. See spec/architecture/artifacts.md.
	await tree.putRoot({
		version: ARTIFACT_VERSION,
		generated: new Date().toISOString(),
		articles: rootArticles,
		pages: rootPages,
		feeds,
		llms,
	});
	return tree.tally;
}

const site = await readSiteFacts(fileURLToPath(new URL('site.config.yaml', SITE)));
const [published, drafted, pageBuild] = await Promise.all([
	buildArticles(INPUTS, { drafts: false }),
	buildArticles(INPUTS, { drafts: true }),
	buildPages({ contents: INPUTS.contents, messages: INPUTS.messages, segments: INPUTS.segments }),
]);

/**
 * Point the draft tree at the published assets it does not hold, so one directory covers both.
 *
 * Anything at the top of `data/public` that publishing did not write is an asset prefix, which is
 * why no prefix is named here. See spec/architecture/artifacts.md, "Drafts leave the corpus at
 * publication, not at build".
 */
async function linkAssets(publicDir: string, draftDir: string): Promise<string[]> {
	const owned = new Set([
		...ARTIFACT_TYPES.map((type) => type.split('/')[0]),
		ROOT_KEY.split('/')[0],
	]);
	const linked: string[] = [];
	for (const entry of await readdir(publicDir, { withFileTypes: true })) {
		if (!entry.isDirectory() || owned.has(entry.name)) continue;
		const link = join(draftDir, entry.name);
		const target = join(relative(draftDir, publicDir), entry.name);
		const current = await readlink(link).catch(() => undefined);
		if (current === target) continue;
		if (current !== undefined) await unlink(link);
		await symlink(target, link);
		linked.push(entry.name);
	}
	return linked;
}

// A draft is compiled like anything else and kept out of the public tree by the corpus it was
// compiled from, not by a filter here. See spec/architecture/artifacts.md, "Drafts leave the
// corpus at publication, not at build".
const trees = [
	{ name: 'public', dir: new URL('data/public/', ROOT), articles: published.articles },
	{ name: 'draft', dir: new URL('data/draft/', ROOT), articles: drafted.articles },
];

for (const { name, dir, articles } of trees) {
	const { written, present, bytes } = await publishCorpus(
		fileURLToPath(dir),
		articles,
		pageBuild.pages,
		site,
	);
	console.log(
		`${name}: ${articles.length} articles, ${pageBuild.pages.length} pages, ` +
			`${written + present} objects -- ${written} written ` +
			`(${bytes.toLocaleString('en-US')} bytes), ${present} already present`,
	);
}

const linked = await linkAssets(
	fileURLToPath(new URL('data/public/', ROOT)),
	fileURLToPath(new URL('data/draft/', ROOT)),
);
if (linked.length > 0) console.log(`draft: linked ${linked.join(', ')} from the published tree`);

/**
 * Compile the corpus and write every published object, then the root that names them.
 *
 * This is what the site's build used to do in-process. It no longer does: the site is rebuilt
 * when its own code changes, and the corpus is published on its own schedule from here.
 * See spec/architecture/artifacts.md.
 */
import {
	mkdir,
	readFile,
	readdir,
	stat,
	writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
	ARTIFACT_EXTENSIONS,
	ARTIFACT_VERSION,
	ROOT_KEY,
	storageKey,
	type ArtifactType,
	type PublishedPage,
	type PublishedView,
	type Root,
	type RootArticle,
	type RootView,
} from '@canmi/artifacts';
import type { Article, Page } from '@canmi/artifacts/types';
import { URLS } from '@canmi/urls';
import { buildArticles, buildPages } from '@canmi/compile/articles';
import { LOCALE_CODES } from '../src/lib/locale/index.ts';

const ROOT = new URL('../../../', import.meta.url);
const SITE = new URL('apps/site/', ROOT);

/**
 * The corpus compiler's inputs, which are the ones vite.config.ts passes.
 *
 * Production addresses throughout: an object names where its assets actually live, wherever the
 * pass that wrote it was run.
 */
const INPUTS = {
	brand: fileURLToPath(new URL('data/source/brand', ROOT)),
	notice: fileURLToPath(new URL('data/build/licenses-full.txt', ROOT)),
	cards: fileURLToPath(new URL('data/build/opengraph.json', ROOT)),
	contents: fileURLToPath(new URL('contents', ROOT)),
	cdnUrl: URLS.apps.production.cdn,
	messages: fileURLToPath(new URL('../../libs/messages/messages', SITE)),
	assets: fileURLToPath(new URL('data/record/metadata.json', ROOT)),
	media: fileURLToPath(new URL('data/record/media.yaml', ROOT)),
	diagrams: fileURLToPath(new URL('data/record/diagram.json', ROOT)),
	segments: fileURLToPath(new URL('data/build/segments.json', ROOT)),
	routes: fileURLToPath(new URL('src/routes', SITE)),
	crates: fileURLToPath(new URL('data/build/crates.json', ROOT)),
	repos: fileURLToPath(new URL('data/build/repos.json', ROOT)),
	tweets: fileURLToPath(new URL('data/build/twitter.json', ROOT)),
};

type Tally = { written: number; present: number; bytes: number };

/**
 * Two trees on disk, addressed exactly as the two buckets address them.
 *
 * Objects go in one and the root in the other, because they become separate buckets read by
 * separate workers. See spec/architecture/data.md, "One bucket holds records and the other holds
 * bytes".
 */
class Tree {
	readonly #dir: string;
	readonly #metadata: string;
	readonly #made = new Set<string>();
	readonly tally: Tally = { written: 0, present: 0, bytes: 0 };

	constructor(dir: string, metadata: string) {
		this.#dir = dir;
		this.#metadata = metadata;
	}

	/** Write one immutable object and answer the hash the root names it by. */
	async put(type: ArtifactType, body: string): Promise<string> {
		const bytes = Buffer.from(body, 'utf8');
		const digest = bytesToHex(blake3(bytes, { dkLen: 16 }));
		// Stored by content id alone; the type only appears in the address the CDN serves it at.
		const file = join(this.#dir, storageKey(digest, ARTIFACT_EXTENSIONS[type]));
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

	/**
	 * Write one immutable object that was already bytes, and answer the hash it is named by.
	 *
	 * The site's own marks arrive this way: authored files rather than compiled ones, but objects
	 * in every other respect. Nothing about the bucket distinguishes them.
	 */
	async putBytes(bytes: Buffer, extension: string): Promise<string> {
		const digest = bytesToHex(blake3(bytes, { dkLen: 16 }));
		const file = join(this.#dir, storageKey(digest, extension));
		if (await this.#exists(file)) {
			this.tally.present += 1;
			return digest;
		}
		await this.#write(file, bytes);
		return digest;
	}

	/** Write the root, which is the one name in either tree whose bytes change under it. */
	async putRoot(root: Root): Promise<void> {
		await this.#write(join(this.#metadata, ROOT_KEY), Buffer.from(JSON.stringify(root), 'utf8'));
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

/**
 * The cards `cms og` drew, keyed by `{view}/{slug}` as its record keys them.
 *
 * Read rather than derived: a card is content-addressed now, so there is no address to build from
 * a slug and the record is the only place its id is written. A view with no entry is a view
 * published before its card was drawn, which is a state rather than a fault.
 */
async function drawnCards(): Promise<Record<string, string>> {
	const record = JSON.parse(await readFile(INPUTS.cards, 'utf8').catch(() => '{}')) as {
		cards?: Record<string, { cid?: string }>;
	};
	return Object.fromEntries(
		Object.entries(record.cards ?? {})
			.filter(([, card]) => typeof card.cid === 'string')
			.map(([key, card]) => [key, card.cid as string]),
	);
}

async function publishArticle(
	tree: Tree,
	article: Article,
	cards: Record<string, string>,
): Promise<RootArticle> {
	const views: RootArticle['views'] = {};
	for (const code of LOCALE_CODES) {
		const view = article.views[code];
		const published: PublishedView = {
			version: ARTIFACT_VERSION,
			// The identity, never the address. An object outlives the directory it was published
			// from, so an envelope naming the path would fail its own check the first time this
			// article was recategorised. See spec/architecture/artifacts.md.
			slug: article.slug,
			locale: code,
			meta: view.meta,
			language: {
				tag: view.language_tag,
				canonical: view.canonical,
				translated: view.translation_available,
				alternates: article.alternates,
			},
			body: {
				phone_title: view.phone_title,
				toc: view.toc,
				blocks: view.blocks,
				summary: view.summary,
			},
			metrics: { words: view.words },
		};
		views[code] = {
			objects: {
				content: await tree.put('content', JSON.stringify(published)),
				card: cards[`${code}/${article.path}`],
			},
			locale: {
				language_tag: view.language_tag,
				canonical: view.canonical,
				translated: view.translation_available,
			},
			meta: {
				title: view.meta.title,
				subtitle: view.meta.subtitle,
				description: view.meta.description,
				short: { title: view.short.title, subtitle: view.short.subtitle },
			},
			dates: {
				created: view.meta.created,
				published: view.meta.published,
				lastmod: view.meta.lastmod,
			},
			metrics: { words: view.words },
			preview: { paragraphs: paragraphs(view.text) },
		} satisfies RootView;
	}
	return {
		slug: article.slug,
		path: article.path,
		url: article.url,
		markdown: await tree.put('markdown', article.markdown),
		alternates: article.alternates,
		canonical_urls: article.canonical_urls,
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
async function publishPage(
	tree: Tree,
	page: Page,
	cards: Record<string, string>,
): Promise<Root['pages'][string]> {
	const views: Root['pages'][string]['views'] = {};
	for (const code of LOCALE_CODES) {
		const view = page.views[code];
		const published: PublishedPage = {
			version: ARTIFACT_VERSION,
			slug: page.path,
			meta: view.meta,
			blocks: view.blocks,
		};
		views[code] = {
			content: await tree.put('page', JSON.stringify(published)),
			card: cards[`${code}/${page.path}`],
		};
	}
	return { markdown: await tree.put('markdown', page.markdown), views };
}

/**
 * The site's own marks, published like any other object and named in the root.
 *
 * Authored rather than derived, so they live in `data/source/brand` and travel with the
 * repository: a favicon nobody can regenerate was sitting loose in the published tree, which is
 * to say on one machine. A browser asks for `/favicon.ico`, and the alias layer turns that name
 * into the object named here. See spec/architecture/delivery.md.
 */
async function publishBrand(tree: Tree): Promise<Root['assets']> {
	const assets: Root['assets'] = {};
	for (const name of (await readdir(INPUTS.brand)).toSorted()) {
		if (name.startsWith('.')) continue;
		const extension = name.slice(name.lastIndexOf('.') + 1);
		const bytes = await readFile(join(INPUTS.brand, name));
		assets[name] = { cid: await tree.putBytes(bytes, extension), extension };
	}
	return assets;
}

/**
 * The attribution notice, assembled by `cms licenses` and published as one object.
 *
 * A build product rather than an authored one, and rewritten whenever the dependency tree moves,
 * which is precisely what a content-addressed key may not be. So it is hashed in here, and the
 * name is what anything asking for it uses.
 */
async function publishNotice(tree: Tree): Promise<Root['assets']> {
	const bytes = await readFile(INPUTS.notice).catch(() => undefined);
	if (!bytes) return {};
	return {
		'licenses.txt': { cid: await tree.putBytes(bytes, 'txt'), extension: 'txt' },
	};
}

async function publishCorpus(
	dir: string,
	metadata: string,
	articles: Article[],
	pages: Page[],
): Promise<Tally> {
	const tree = new Tree(dir, metadata);
	const rootArticles: RootArticle[] = [];
	const cards = await drawnCards();
	for (const article of articles) rootArticles.push(await publishArticle(tree, article, cards));
	const rootPages: Root['pages'] = {};
	for (const page of pages) rootPages[page.path] = await publishPage(tree, page, cards);
	// Last, and only once every object it names is on disk. A root that arrives first names
	// objects that answer 404, and a 404 on a content-addressed key is the one answer this
	// design cannot afford to have cached. See spec/architecture/artifacts.md.
	await tree.putRoot({
		version: ARTIFACT_VERSION,
		generated: new Date().toISOString(),
		// **This site's own names, and nobody else's.** Another site's mark used to be fifteen
		// entries here, named `favicon/{domain}/{tone}` because that is what a link card could
		// build from the domain it knew. It is a resource now: `cms favicon` hashes the bytes in
		// and writes the record, a card compiles to a rid, and the page asks what that rid means.
		// See spec/architecture/resource.md, "The catalogue".
		assets: {
			...(await publishBrand(tree)),
			...(await publishNotice(tree)),
		},
		articles: rootArticles,
		pages: rootPages,
	});
	return tree.tally;
}

const [published, pageBuild] = await Promise.all([
	buildArticles(INPUTS, { drafts: false }),
	buildPages({ contents: INPUTS.contents, messages: INPUTS.messages, segments: INPUTS.segments }),
]);

/**
 * One tree of objects and one root over it.
 *
 * There was a second root naming the drafts as well, so that a development site could open an
 * article nothing had published. The CMS renders a draft from the draft row now, which answers
 * that need where the writing already is -- so the root, the symlink it needed to reach the
 * records, and the pass that built it are all gone. See spec/drafts.md.
 */
const objectsDir = new URL('data/bucket/objects/', ROOT);
const metadataDir = new URL('data/bucket/metadata/', ROOT);

const { written, present, bytes } = await publishCorpus(
	fileURLToPath(objectsDir),
	fileURLToPath(metadataDir),
	published.articles,
	pageBuild.pages,
);
console.log(
	`public: ${published.articles.length} articles, ${pageBuild.pages.length} pages, ` +
		`${written + present} objects -- ${written} written ` +
		`(${bytes.toLocaleString('en-US')} bytes), ${present} already present`,
);

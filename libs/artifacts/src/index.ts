import * as v from 'valibot';
import { LOCALE_CODES, type LocaleCode } from '@canmi/locales';
import { byLocale, hash, HASH_PATTERN } from './schema.ts';
import type {
	Alternate,
	ArticleMeta,
	ArticleSummary,
	Block,
	PageBlock,
	PageView,
	TocEntry,
} from './types.ts';

export type * from './types.ts';
export * from './api.ts';
export * from './feed.ts';
export * from './engagement.ts';
export * from './batch.ts';
export * from './resource.ts';
export * from './picture.ts';
export { HASH_PATTERN } from './schema.ts';

/**
 * The shape every published object declares.
 *
 * Bumped when a producer and a consumer can no longer read each other. They deploy separately
 * now, so this is the only thing that tells a Worker it is holding bytes it does not understand.
 */
export const ARTIFACT_VERSION = 2;

export const ARTIFACT_TYPES = ['content', 'page', 'markdown'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

/** What each corpus artifact is spelled with, in the address and in the bucket alike. */
export const ARTIFACT_EXTENSIONS = {
	content: 'json',
	page: 'json',
	markdown: 'md',
} as const satisfies Record<ArtifactType, string>;

const EXTENSION = ARTIFACT_EXTENSIONS;

/** The one object in the bucket whose name outlives its bytes. */
export const ROOT_KEY = 'state/index.json';

/**
 * The address a published object is served at.
 *
 * `object/{hash}.{ext}` -- not where it is stored, and no longer naming what kind of thing it is
 * either. The type survives as the one thing that decides the extension: a caller asks for a
 * `content` object and the table below says that is spelled `json`.
 */
export function artifactAddress(type: ArtifactType, hash: string): string {
	return `object/${hash}.${EXTENSION[type]}`;
}

/**
 * Where an object lives: its content id, fanned out, and nothing else.
 *
 * **The bucket's layout is not the CDN's URL.** A URL says `/object/{cid}.{ext}`; the bucket stores
 * `{ab}/{cd}/{cid}.{ext}`, because the id already identifies it and a type directory would be a
 * second place to write the same fact. The fan-out is for listing, and the extension is kept so a
 * bucket downloaded whole is still files that open. See spec/architecture/data.md, "The
 * bucket stores content ids, and so does the address".
 */
export function storageKey(cid: string, extension: string): string {
	return `${cid.slice(0, 2)}/${cid.slice(2, 4)}/${cid}.${extension}`;
}

/**
 * Where a resource's record lives, which is in the other bucket entirely.
 *
 * **Keyed by the rid and never by a cid.** A key ending in a hash reads as content-addressed,
 * and the cache policy read the shape and granted a year -- to a record rewritten whenever its
 * asset is re-derived. That is the confusion spec/architecture/resource.md exists to end. See
 * also spec/architecture/data.md, "One bucket holds records and the other holds bytes".
 */
export function recordKey(resource: string): string {
	return `meta/${resource}.json`;
}

/**
 * The classifier the cache policy is derived from, rather than a table of key prefixes.
 *
 * A key that parses is content-addressed and may be held forever; one that does not is not, and
 * gets the short life. That is the whole rule, so a new type costs no cache decision.
 */
export function parseArtifactKey(
	key: string,
): { type: ArtifactType; hash: string; ext: string } | undefined {
	const match = /^([a-z]+)\/([0-9a-f]+)\.([a-z0-9]+)$/.exec(key);
	if (!match) return undefined;
	const [, type, hash, ext] = match;
	if (!type || !hash || !ext) return undefined;
	if (!HASH_PATTERN.test(hash)) return undefined;
	if (!(ARTIFACT_TYPES as readonly string[]).includes(type)) return undefined;
	if (EXTENSION[type as ArtifactType] !== ext) return undefined;
	return { type: type as ArtifactType, hash, ext };
}

/**
 * What an article says it is: the copy a page renders in its own right.
 *
 * `short` is the pair a phone card shows where the row clips, and it is a pair rather than two
 * keys because it is one decision -- see spec/i18n/prose.md.
 */
export const ViewMetaSchema = v.object({
	title: v.string(),
	subtitle: v.string(),
	description: v.string(),
	short: v.object({ title: v.string(), subtitle: v.string() }),
});

/**
 * One locale's view, grouped by what each group answers rather than laid out flat.
 *
 * Flat, this was thirteen keys where `title` sat beside `content` and `words` beside
 * `language_tag`, and a reader had to know the whole list to find anything. Each group below
 * answers one question: which objects carry it, which language it is, what it says, when it was
 * written, how big it is, and what a listing shows of it.
 */
export const RootViewSchema = v.object({
	// The card is optional because `local og` runs on its own schedule: a view published before the
	// card was drawn is a view with no card, not a broken one.
	objects: v.object({ content: hash, card: v.optional(hash) }),
	locale: v.object({
		language_tag: v.string(),
		canonical: v.string(),
		/** False when this locale is showing the source article as a safe fallback. */
		translated: v.boolean(),
	}),
	meta: ViewMetaSchema,
	/**
	 * When the file came into being, when the article went public, and when it last changed.
	 * `published` is the author's to edit and the one a reader is shown.
	 *
	 * **A `v.object` drops a key it does not declare rather than refusing it**, so a producer
	 * that writes a fourth date without adding it here hands every consumer `undefined` and
	 * nothing reports it. `index.test.ts` pins this key set for that reason.
	 */
	dates: v.object({ created: v.string(), published: v.string(), lastmod: v.string() }),
	metrics: v.object({ words: v.number() }),
	// The opening prose the homepage card draws its body bars from. Carried here so listing every
	// article costs one request rather than one per article; it is the only body text the root holds.
	preview: v.object({ paragraphs: v.array(v.string()) }),
});

/**
 * The codes an alternate may carry, which are narrower than the locales.
 *
 * `mw` is the source and is never an alternate of itself; `x-default` is the bare URL. Parsed as
 * the picklist rather than as a string so the root validates into `Alternate` -- the type every
 * consumer of these already assumes, and which a looser parse let the root quietly contradict.
 */
const alternateCode = v.picklist([
	...LOCALE_CODES.filter((code: LocaleCode) => code !== 'mw'),
	'x-default',
] as Alternate['code'][]);

export const RootArticleSchema = v.object({
	/** The identity: unique across the corpus, and what every question asks with. */
	slug: v.string(),
	/** The address: where it currently lives, which is the only half that can change. */
	path: v.string(),
	url: v.string(),
	markdown: hash,
	alternates: v.array(
		v.object({ code: alternateCode, language_tag: v.string(), href: v.string() }),
	),
	canonical_urls: v.array(v.string()),
	views: byLocale(RootViewSchema),
});

/**
 * A fixed name, and the object it currently means.
 *
 * The site's own marks -- its icons, its BIMI mark -- are published like anything else, addressed
 * by their content and cached for a year. What a reader or a mail client asks for is the name, so
 * something has to turn one into the other, and this is what it reads. See
 * spec/architecture/delivery.md, "A name is resolved, never stored".
 */
export const RootAssetSchema = v.object({
	cid: hash,
	extension: v.string(),
});

export type RootAsset = v.InferOutput<typeof RootAssetSchema>;

export const RootSchema = v.object({
	version: v.literal(ARTIFACT_VERSION),
	generated: v.string(),
	/** Fixed names the alias layer resolves, keyed by the name as it is asked for. */
	assets: v.record(v.string(), RootAssetSchema),
	articles: v.array(RootArticleSchema),
	pages: v.record(
		v.string(),
		v.object({
			markdown: hash,
			views: byLocale(v.object({ content: hash, card: v.optional(hash) })),
		}),
	),
});

export type ViewMeta = v.InferOutput<typeof ViewMetaSchema>;
export type Root = v.InferOutput<typeof RootSchema>;
export type RootArticle = v.InferOutput<typeof RootArticleSchema>;
export type RootView = v.InferOutput<typeof RootViewSchema>;

/**
 * What each API route answers, shared by the Worker that writes one and the site that reads it.
 *
 * Types rather than schemas: they are checked where both sides compile, not parsed at an edge,
 * which is the line spec/architecture/artifacts.md draws under "Validation is heavy where it is
 * free". Two hand-written spellings of these disagreed six times in one afternoon, silently.
 */
/**
 * One article, as the API answers for it.
 *
 * The root's view grouped as it is stored, plus the two things only a request can supply: which
 * article was asked for. No read count: a counter is written by every visitor and a view is not,
 * so carrying it here gave one number nine cached copies of itself. See
 * spec/architecture/artifacts.md, "A read count is not here at all".
 */
export type ViewAnswer = Omit<RootView, 'locale'> & {
	/** What was asked for: the identity, which is the only thing `?slug=` takes. */
	slug: string;
	/**
	 * Where it lives, which the answer supplies because the question deliberately does not.
	 *
	 * This is what lets the site tell a canonical address from one that merely reaches the
	 * article: `/{wrong}/{slug}` and `/{slug}` both resolve, and both are redirected here. See
	 * spec/architecture/artifacts.md, "Reaching an article by name".
	 */
	path: string;
	url: string;
	locale: RootView['locale'] & { code: LocaleCode };
};

/**
 * The homepage: the articles it lists, and the compiled page its own copy comes from.
 *
 * The locale is named once at the top rather than on every row, because one request answers in
 * one language and repeating it per article is the same fact N times.
 */
export type HomeAnswer = {
	locale: { code: LocaleCode; language_tag: string };
	page: { objects: { content: string; card?: string } } | null;
	articles: (Omit<RootView, 'locale'> & { slug: string; path: string; url: string })[];
};

/**
 * What a feed is built out of: metadata and a hash per entry, never the document.
 *
 * `locale` stays per entry rather than moving to the top the way the homepage's does, because an
 * untranslated article is served as the source view and carries the source's language tag --
 * which is what decides whether the feed declares one language or `mul`. See
 * spec/architecture/artifacts.md, "Which objects exist".
 */
export type FeedAnswer = {
	locale: { code: LocaleCode };
	entries: {
		slug: string;
		url: string;
		objects: { content: string };
		locale: RootView['locale'];
		meta: { title: string; description: string };
		dates: { created: string; published: string; lastmod: string };
	}[];
};

/**
 * `/asset?name=`: which object a fixed name stands for right now.
 *
 * The name is echoed so an answer can be read without remembering what was asked, which is what
 * lets the alias layer pass one straight through to a redirect.
 */
export type AssetAnswer = RootAsset & { name: string };

export type SitemapAnswer = {
	/** When the root was written, which is the lastmod for a route carrying no date of its own. */
	generated: string;
	views: { loc: string; lastmod: string; alternates: Alternate[] }[];
};

/**
 * `/source`: which object holds the written source, and where the thing it belongs to lives.
 *
 * The path is here for the same reason `ViewAnswer` carries one -- the question asked by identity,
 * so only the answer can say whether the address it was asked at is the real one.
 */
export type DocumentAnswer = { hash: string; path: string };

/**
 * What a consumer checks before trusting an object's body.
 *
 * Version, slug and locale only -- the slug being the identity, never the path, because an object
 * outlives the directory it was published from. The body is not revalidated at an edge: the
 * producer is trusted and what this catches is version skew. See spec/architecture/artifacts.md,
 * "Validation is heavy where it is free and light where it is not".
 */
export const EnvelopeSchema = v.object({
	version: v.literal(ARTIFACT_VERSION),
	slug: v.string(),
	locale: v.picklist(LOCALE_CODES),
});

/**
 * The same check for a page, which has no locale to check.
 *
 * A page is compiled once and filed under every locale -- see the builder, and spec/i18n/copy.md
 * for why identity copy is not translated. Giving its envelope a locale made nine objects that
 * differed in one field, which is de-duplication defeated by a field that meant nothing.
 */
export const PageEnvelopeSchema = v.object({
	version: v.literal(ARTIFACT_VERSION),
	slug: v.string(),
});

export function readPageEnvelope(value: unknown, slug: string): void {
	const envelope = v.parse(PageEnvelopeSchema, value);
	if (envelope.slug !== slug) {
		throw new Error(`page artifact is ${envelope.slug}, asked for ${slug}`);
	}
}

export function readEnvelope(value: unknown, slug: string, locale: LocaleCode): void {
	const envelope = v.parse(EnvelopeSchema, value);
	if (envelope.slug !== slug || envelope.locale !== locale) {
		throw new Error(`artifact is ${envelope.slug}/${envelope.locale}, asked for ${slug}/${locale}`);
	}
}

/** One article view, as published. The load data the page renders from, and nothing besides. */
export type PublishedView = {
	version: typeof ARTIFACT_VERSION;
	/** The identity, matching the envelope. Where the article lives is the root's to say. */
	slug: string;
	locale: LocaleCode;
	/** The frontmatter, which already carries this article's dates and source language. */
	meta: ArticleMeta;
	/** How this view is addressed and whether it is a translation at all. */
	language: {
		tag: string;
		canonical: string;
		translated: boolean;
		alternates: Alternate[];
	};
	/** What the page draws. `phone_title` is display, decided at build; see spec/styling/phone.md. */
	body: {
		phone_title: string;
		toc: TocEntry[];
		blocks: Block[];
		summary?: ArticleSummary;
	};
	metrics: { words: number };
};

/**
 * One standalone page view, as published. `homepage` is the only one today.
 *
 * `meta` is the raw frontmatter rather than an `ArticleMeta`: a page has no `lang`, `created` or
 * `lastmod`, and typing it as an article's metadata made a required field out of something no
 * page carries. It carries no locale either, for the reason `readPageEnvelope` gives.
 */
export type PublishedPage = {
	version: typeof ARTIFACT_VERSION;
	slug: string;
	meta: PageView['meta'];
	blocks: PageBlock[];
};

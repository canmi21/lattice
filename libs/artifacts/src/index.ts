import * as v from 'valibot';
import { LOCALE_CODES, type LocaleCode } from '@canmi/locales';
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

/**
 * The shape every published object declares.
 *
 * Bumped when a producer and a consumer can no longer read each other. They deploy separately
 * now, so this is the only thing that tells a Worker it is holding bytes it does not understand.
 */
export const ARTIFACT_VERSION = 1;

/** BLAKE3 truncated to 128 bits, as the bucket spells it. See spec/architecture/artifacts.md. */
export const HASH_PATTERN = /^[0-9a-f]{32}$/;

export const ARTIFACT_TYPES = ['content', 'page', 'markdown'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

const EXTENSION = {
	content: 'json',
	page: 'json',
	markdown: 'md',
} as const satisfies Record<ArtifactType, string>;

/** The one object in the bucket whose name outlives its bytes. */
export const ROOT_KEY = 'state/index.json';

export function artifactKey(type: ArtifactType, hash: string): string {
	return `${type}/${hash}.${EXTENSION[type]}`;
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

const hash = v.pipe(v.string(), v.regex(HASH_PATTERN));

// Every locale is optional: a corpus mid-translation has views the root cannot name yet, and a
// required key would make that a parse failure rather than a fallback.
function byLocale<T extends v.GenericSchema>(value: T) {
	const entries = LOCALE_CODES.map((code: LocaleCode) => [code, value] as const);
	return v.partial(v.object(Object.fromEntries(entries) as Record<LocaleCode, T>));
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
	objects: v.object({ content: hash }),
	locale: v.object({
		language_tag: v.string(),
		canonical: v.string(),
		/** False when this locale is showing the source article as a safe fallback. */
		translated: v.boolean(),
	}),
	meta: ViewMetaSchema,
	dates: v.object({ created: v.string(), lastmod: v.string() }),
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
	path: v.string(),
	url: v.string(),
	markdown: hash,
	alternates: v.array(
		v.object({ code: alternateCode, language_tag: v.string(), href: v.string() }),
	),
	canonical_urls: v.array(v.string()),
	views: byLocale(RootViewSchema),
});

export const RootSchema = v.object({
	version: v.literal(ARTIFACT_VERSION),
	generated: v.string(),
	articles: v.array(RootArticleSchema),
	pages: v.record(
		v.string(),
		v.object({ markdown: hash, views: byLocale(v.object({ content: hash })) }),
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
	slug: string;
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
	page: { objects: { content: string } } | null;
	articles: (Omit<RootView, 'locale'> & { slug: string; url: string })[];
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
		dates: { created: string; lastmod: string };
	}[];
};

/**
 * Several of one article's views at once, for a consumer about to need one of them.
 *
 * `slug` and `url` are named once rather than on every view, which is the only reason this is not
 * a list of `/view` answers. A locale the article has no view in is absent, so asking for nine and
 * receiving four is the answer rather than four errors.
 */
export type ViewsAnswer = {
	slug: string;
	url: string;
	views: Partial<Record<LocaleCode, Omit<ViewAnswer, 'slug' | 'url'>>>;
};

/** Read counts by slug, for every slug asked for that names an article. */
export type ReadsAnswer = { reads: Record<string, number> };

export type SitemapAnswer = {
	/** When the root was written, which is the lastmod for a route carrying no date of its own. */
	generated: string;
	views: { loc: string; lastmod: string; alternates: Alternate[] }[];
};

/** `/markdown/{slug}`: the one answer left that is a hash and nothing else. */
export type DocumentAnswer = { hash: string };

/**
 * What a consumer checks before trusting an object's body.
 *
 * Version, slug and locale only. The body is not revalidated at an edge: the producer is trusted
 * and what this catches is version skew between two things deployed at different times. See
 * spec/architecture/artifacts.md, "Validation is heavy where it is free and light where it is not".
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

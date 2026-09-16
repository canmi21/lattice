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

/**
 * The shape every published object declares.
 *
 * Bumped when a producer and a consumer can no longer read each other. They deploy separately
 * now, so this is the only thing that tells a Worker it is holding bytes it does not understand.
 */
export const ARTIFACT_VERSION = 1;

/** BLAKE3 truncated to 128 bits, as the bucket spells it. See spec/architecture/artifacts.md. */
export const HASH_PATTERN = /^[0-9a-f]{32}$/;

export const ARTIFACT_TYPES = ['content', 'page', 'markdown', 'feed', 'llms'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

const EXTENSION = {
	content: 'json',
	page: 'json',
	markdown: 'md',
	feed: 'xml',
	llms: 'txt',
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

export const RootViewSchema = v.object({
	content: hash,
	title: v.string(),
	subtitle: v.string(),
	description: v.string(),
	shortTitle: v.string(),
	shortSubtitle: v.string(),
	created: v.string(),
	lastmod: v.string(),
	languageTag: v.string(),
	canonical: v.string(),
	translationAvailable: v.boolean(),
	words: v.number(),
	// The opening prose the homepage card draws its body bars from. Carried here so listing every
	// article costs one request rather than one per article; it is the only body text the root holds.
	paragraphs: v.array(v.string()),
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
	alternates: v.array(v.object({ code: alternateCode, languageTag: v.string(), href: v.string() })),
	canonicalUrls: v.array(v.string()),
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
	feeds: byLocale(hash),
	llms: hash,
});

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
export type ViewAnswer = RootView & { slug: string; locale: LocaleCode };

export type HomeAnswer = {
	articles: (RootView & { path: string })[];
	/** The homepage's own copy, or nothing where this locale has no view of it. */
	page: { content: string } | null;
};

export type SitemapAnswer = {
	/** When the root was written, which is the lastmod for a route carrying no date of its own. */
	generated: string;
	views: { loc: string; lastmod: string; alternates: Alternate[] }[];
};

/** `/markdown/{slug}`, `/feed/{locale}` and `/llms` alike: one hash, so one name and not three. */
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
	meta: ArticleMeta;
	phoneTitle: string;
	toc: TocEntry[];
	blocks: Block[];
	summary?: ArticleSummary;
	words: number;
	languageTag: string;
	canonical: string;
	translationAvailable: boolean;
	alternates: Alternate[];
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

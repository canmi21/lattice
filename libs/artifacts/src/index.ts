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
export * from './engagement.ts';
export * from './batch.ts';

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
 * `/{type}/{hash}.{ext}` -- not where it is stored. The bucket files everything by content id
 * alone; the type is here because an address is read by people and a hash says nothing about
 * what it is. See spec/architecture/data.md, "The bucket stores content ids; the CDN serves types".
 */
export function artifactKey(type: ArtifactType, hash: string): string {
	return `${type}/${hash}.${EXTENSION[type]}`;
}

/**
 * Where an object lives: its content id, fanned out, and nothing else.
 *
 * **The bucket's layout is not the CDN's URL.** A URL says `/{type}/{cid}.{ext}`; the bucket stores
 * `{ab}/{cd}/{cid}.{ext}`, because the id already identifies it and a type directory would be a
 * second place to write the same fact. The fan-out is for listing, and the extension is kept so a
 * bucket downloaded whole is still files that open. See spec/architecture/data.md, "The bucket
 * stores content ids; the CDN serves types".
 */
export function storageKey(cid: string, extension: string): string {
	return `${cid.slice(0, 2)}/${cid.slice(2, 4)}/${cid}.${extension}`;
}

/**
 * Where an asset's record lives, which is in the other bucket entirely.
 *
 * Named rather than content-addressed, because the API looks it up by the id of the asset it
 * describes and rewrites it in place when that asset is re-derived. That is exactly what a
 * content-addressed key may not do, which is why these two things are no longer neighbours. See
 * spec/architecture/data.md, "One bucket holds records and the other holds bytes".
 */
export function recordKey(cid: string): string {
	return `meta/${cid}.json`;
}

/**
 * Every type a public address may name, and the extensions each may carry.
 *
 * One table over what used to be two: the corpus knew `content`, `page` and `markdown`, the
 * bucket knew `image`, `video`, `captions` and `license`, and nothing knew all of them at once --
 * so the CDN had two shapes of route for one shape of address. The type is decorative in the
 * lookup and load-bearing in the reading, which is exactly why it has to be checked.
 */
export const PUBLIC_TYPES = {
	captions: ['vtt'],
	content: ['json'],
	// `svg` and `ico` are stored and never derived: the site's own marks are authored in them
	// and there is nothing to transcode. The rest are what a picture is published or re-encoded as.
	image: ['avif', 'webp', 'jpeg', 'png', 'svg', 'ico'],
	license: ['txt'],
	markdown: ['md'],
	page: ['json'],
	video: ['mp4'],
} as const satisfies Record<string, readonly string[]>;

export type PublicType = keyof typeof PUBLIC_TYPES;

export const PUBLIC_TYPE_NAMES = Object.keys(PUBLIC_TYPES) as PublicType[];

export function isPublicType(value: string): value is PublicType {
	return Object.hasOwn(PUBLIC_TYPES, value);
}

/** Whether this type is allowed to be spelled with this extension. */
export function typeCarries(type: PublicType, extension: string): boolean {
	return (PUBLIC_TYPES[type] as readonly string[]).includes(extension);
}

/**
 * The one type an extension names, when there is exactly one.
 *
 * What a wrong type in an address is corrected to. `json` names two -- a compiled view and a
 * standalone page -- so an address carrying it is left alone rather than corrected to a guess;
 * the envelope inside the object is what says which it really is.
 */
export function typeForExtension(extension: string): PublicType | undefined {
	const found = PUBLIC_TYPE_NAMES.filter((type) => typeCarries(type, extension));
	return found.length === 1 ? found[0] : undefined;
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

/** A content id as every schema here spells one. */
const hash = v.pipe(v.string(), v.regex(HASH_PATTERN));

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
	type: v.picklist(PUBLIC_TYPE_NAMES),
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
	page: { objects: { content: string } } | null;
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
		dates: { created: string; lastmod: string };
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

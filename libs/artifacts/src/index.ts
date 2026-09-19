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
	// The card is optional because `cms og` runs on its own schedule: a view published before the
	// card was drawn is a view with no card, not a broken one.
	objects: v.object({ content: hash, card: v.optional(hash) }),
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

/**
 * The envelope's own version, which moves only when one of its five keys moves.
 *
 * Adding a type, adding a layer or changing what a layer holds touches none of those names, so
 * none of them is a 6. A version that rose for reasons unrelated to what a reader parses would
 * teach the reader to ignore it. See spec/architecture/resource.md, "The record".
 */
export const RESOURCE_VERSION = 5;

/**
 * A resource id: five characters of lowercase base36.
 *
 * The other id entirely -- `HASH_PATTERN` above identifies a run of bytes, this identifies a
 * thing, and nothing converts one into the other. Five is chosen for the address space and for a
 * human reading article source, not for a birthday bound: collisions are not a probability here
 * because allocation checks the register first. See spec/architecture/resource.md, "Two ids".
 */
export const RESOURCE_PATTERN = /^[0-9a-z]{5}$/;

export function isResourceId(value: string): boolean {
	return RESOURCE_PATTERN.test(value);
}

/** A rid as every schema here spells one, beside `hash`, which is the other id. */
const rid = v.pipe(v.string(), v.regex(RESOURCE_PATTERN));

export type ResourceId = v.InferOutput<typeof rid>;

/** `media.image.photo`: segments read left to right, each one a key in the register below. */
const namespace = v.pipe(v.string(), v.regex(/^[a-z]+(?:\.[a-z]+)*$/));

/**
 * What a layer carries whatever it is, checked before the layer's own schema runs.
 *
 * The number is per layer rather than on the envelope so a layer that changes shape raises its
 * own and nothing above it notices.
 */
const layered = { version: v.number() } as const;

/**
 * What a resource is derived from, including bytes nobody can fetch.
 *
 * A list, because re-scanning a subject adds an origin to the resource rather than making a
 * second one. The originals are never published; the cid is kept so the next import of the same
 * file is recognised and skipped. See spec/architecture/resource.md, "`source` and `origin`".
 */
export const MediaLayerSchema = v.object({
	...layered,
	origin: v.array(v.object({ blake3: hash, mime: v.string(), bytes: v.number() })),
});

/** The mimes that serve any size, named once so no caller has to repeat the condition. */
const SCALABLE_MIMES = new Set(['image/svg+xml']);

/**
 * One published encoding of a picture.
 *
 * `resolution` is absent on a vector for the same reason the layer's is: there are no pixels to
 * report, and a caller that asks and receives nothing has its answer. `quality` is the normalised
 * encoder setting, kept because re-deriving has to reproduce what was published.
 */
export const ImageVariantSchema = v.object({
	content: hash,
	mime: v.string(),
	bytes: v.number(),
	resolution: v.optional(v.object({ width: v.number(), height: v.number() })),
	quality: v.optional(v.number()),
});

/**
 * Two facts about a picture, and only one of them is universal.
 *
 * `dimension` is the intrinsic box -- an SVG's `viewBox`, a bitmap's pixels -- and is what layout
 * is computed from. `resolution` is actual pixels and bitmaps only: **absent is the answer**, so
 * a vector needs no second field saying it is one. The variants bind here because this is the
 * first layer at which content is a fact. See spec/architecture/resource.md, "four steps".
 */
export const ImageLayerSchema = v.object({
	...layered,
	/**
	 * Base64 thumbhash: the compact canonical placeholder, and the only form kept. The site build
	 * decodes it once and inlines the result, so a reader sees the picture before it arrives.
	 */
	thumbhash: v.string(),
	dimension: v.object({ width: v.number(), height: v.number(), aspect: v.string() }),
	resolution: v.optional(v.object({ width: v.number(), height: v.number() })),
	variants: v.array(ImageVariantSchema),
});

/**
 * What a sensor did, which is worked out once at import and never again.
 *
 * Every field is optional and nothing here is trusted about the file: dimensions come from
 * decoding, and `address` is not in the file at all -- it is looked up offline from `location`.
 * See spec/architecture/media.md, "Where a photograph was taken is worked out offline".
 *
 * Spread into two layers rather than named as one, because `apps/cms/src/image/exif.rs` is
 * flattened into both and a wrapper here would be a key the Rust side never writes.
 */
const exif = {
	captured: v.optional(v.string()),
	camera: v.optional(
		v.object({ model: v.optional(v.string()), manufacturer: v.optional(v.string()) }),
	),
	lens: v.optional(
		v.object({
			model: v.optional(v.string()),
			manufacturer: v.optional(v.string()),
			focal_length: v.optional(v.number()),
			focal_length_35mm: v.optional(v.number()),
			f_number: v.optional(v.number()),
		}),
	),
	exposure: v.optional(
		v.object({
			// Kept as it was written -- `1/1437` rather than a float, because the fraction is what a
			// camera reports and rounding it would state a shutter speed nothing chose.
			time: v.optional(v.string()),
			iso: v.optional(v.number()),
			bias_ev: v.optional(v.number()),
			mode: v.optional(v.string()),
			program: v.optional(v.string()),
			metering: v.optional(v.string()),
			white_balance: v.optional(v.string()),
			flash: v.optional(v.boolean()),
		}),
	),
	location: v.optional(
		v.object({
			// Optional, both of them: a file can carry a latitude and no longitude, and requiring
			// the pair would fail the whole record over half a position nobody was going to plot.
			latitude: v.optional(v.number()),
			longitude: v.optional(v.number()),
			altitude: v.optional(v.number()),
			accuracy: v.optional(v.number()),
			direction: v.optional(v.number()),
		}),
	),
	address: v.optional(
		v.object({
			continent: v.optional(v.string()),
			country: v.optional(v.string()),
			country_code: v.optional(v.string()),
			region: v.optional(v.string()),
			subregion: v.optional(v.string()),
			city: v.optional(v.string()),
			district: v.optional(v.string()),
			postal_code: v.optional(v.string()),
			timezone: v.optional(v.string()),
		}),
	),
	software: v.optional(v.string()),
	color_space: v.optional(v.string()),
	/** Read and honoured on the way in: ignoring it turns every derived image. */
	orientation: v.optional(v.number()),
} as const;

/** A camera pointed at the world, which is the whole of what this layer brings. */
export const PhotoLayerSchema = v.object({ ...layered, ...exif });

/**
 * A capture of a screen, which is what a picture with no camera turns out to be.
 *
 * The scale is what earns this its own layer: a screenshot is taken at a device pixel ratio, and
 * without it nothing can say whether a 2560px capture is a wide screen or a retina one. The rest
 * is the same account a photograph carries -- ten records here hold `color_space` and `software`,
 * and a layer with no home for them would drop them on the way past.
 */
export const ScreenshotLayerSchema = v.object({
	...layered,
	scale: v.optional(v.number()),
	...exif,
});

/**
 * A still cut from a clip, pointing back at what it was cut from.
 *
 * The clip's `cover` points here and this points there, and that is not a cycle to remove:
 * replacing the cover leaves this a frame of that clip. See spec/architecture/resource.md,
 * "References resolve lazily".
 */
export const FrameLayerSchema = v.object({
	...layered,
	source: rid,
	/** Seconds into the clip, which is the one thing the picture itself cannot say. */
	at: v.optional(v.number()),
});

/**
 * Another site's mark: one resource per domain, in both schemes.
 *
 * Light and dark are two pictures rather than two encodings of one, so they bind here rather than
 * in the image layer's variants, which answer for a single picture.
 */
export const IconLayerSchema = v.object({
	...layered,
	domain: v.string(),
	scheme: v.object({ light: v.optional(hash), dark: v.optional(hash) }),
});

/**
 * This site's own mark: one thing, six files.
 *
 * A map under fixed names rather than a variant list, because each of these is asked for by name
 * -- a favicon, a touch icon, a BIMI mark -- and never by size. See
 * spec/architecture/delivery.md, "A name is resolved, never stored".
 */
export const MarkLayerSchema = v.object({
	...layered,
	files: v.record(v.string(), v.object({ content: hash, mime: v.string(), bytes: v.number() })),
});

/**
 * A moving picture: what the source was, what was published of it, and what is read over it.
 *
 * The source numbers are kept because a rung is a re-encode and none of them can be read back off
 * one. `codec` is the full RFC 6381 string and names every track, since that is what a browser
 * reads to decide whether it can play the file at all. See spec/architecture/video/pipeline.md.
 */
export const VideoLayerSchema = v.object({
	...layered,
	source: v.object({
		mime: v.string(),
		width: v.number(),
		height: v.number(),
		aspect: v.string(),
		bytes: v.number(),
		duration: v.number(),
		frame_rate: v.number(),
		frames: v.number(),
		audio: v.boolean(),
		loudness: v.optional(v.number()),
		peak: v.optional(v.number()),
	}),
	/** The poster frame, which is a resource of its own because it is referred to from two places. */
	cover: rid,
	variants: v.array(
		v.object({
			content: hash,
			mime: v.string(),
			bytes: v.number(),
			resolution: v.object({ width: v.number(), height: v.number() }),
			codec: v.string(),
		}),
	),
	// A caption track binds here rather than earning a rid: it is a file belonging to one clip and
	// is reached from nowhere else. See spec/architecture/resource.md, "The catalogue".
	tracks: v.array(
		v.object({
			content: hash,
			mime: v.string(),
			language: v.string(),
			kind: v.picklist(['captions', 'subtitles', 'descriptions']),
			bytes: v.number(),
		}),
	),
});

/**
 * A clip, which is a video cut from a longer one.
 *
 * The excerpt is what the layer brings: seconds into the original, which no derived file records
 * and which is the difference between a clip and the thing it came out of.
 */
export const ClipLayerSchema = v.object({
	...layered,
	excerpt: v.optional(v.object({ from: v.number(), to: v.number() })),
});

/**
 * Written prose: one source, and the views compiled out of it.
 *
 * The nine locale bodies are what the document is made of rather than nine things, so they bind
 * here and none of them has a rid. `slug` is the identity and the address is the root's to say.
 * See spec/architecture/resource.md, "The catalogue".
 */
export const DocumentLayerSchema = v.object({
	...layered,
	slug: v.string(),
	source: hash,
	locales: byLocale(
		v.object({
			content: hash,
			card: v.optional(hash),
			/** False when this locale is showing the source as a safe fallback. */
			translated: v.boolean(),
		}),
	),
});

/** An article: the document, plus the two things a page without a date does not carry. */
export const PostLayerSchema = v.object({
	...layered,
	dates: v.object({ created: v.string(), lastmod: v.string() }),
	tags: v.array(v.string()),
});

/**
 * The attribution text, which is the one document nobody writes.
 *
 * Rewritten whenever the dependency tree moves, so when it was last derived is the fact that
 * distinguishes it from prose someone sat down and wrote.
 */
export const NoticeLayerSchema = v.object({
	...layered,
	generated: v.string(),
});

/**
 * The register a `type` segment selects a parser from, and the highest version each build reads.
 *
 * The version is held beside the schema rather than inside it: a layer numbered above what is
 * here is a shape from a newer producer, and the answer is to stop at that segment rather than to
 * fail the whole record. See spec/architecture/resource.md, "Parsing is optimistic".
 */
export const LAYERS = {
	media: { version: 1, schema: MediaLayerSchema },
	image: { version: 1, schema: ImageLayerSchema },
	photo: { version: 1, schema: PhotoLayerSchema },
	screenshot: { version: 1, schema: ScreenshotLayerSchema },
	frame: { version: 1, schema: FrameLayerSchema },
	icon: { version: 1, schema: IconLayerSchema },
	mark: { version: 1, schema: MarkLayerSchema },
	video: { version: 1, schema: VideoLayerSchema },
	clip: { version: 1, schema: ClipLayerSchema },
	document: { version: 1, schema: DocumentLayerSchema },
	post: { version: 1, schema: PostLayerSchema },
	notice: { version: 1, schema: NoticeLayerSchema },
} as const;

export type LayerName = keyof typeof LAYERS;
export type LayerOf<N extends LayerName> = v.InferOutput<(typeof LAYERS)[N]['schema']>;

export type MediaLayer = v.InferOutput<typeof MediaLayerSchema>;
export type ImageLayer = v.InferOutput<typeof ImageLayerSchema>;
export type ImageVariant = v.InferOutput<typeof ImageVariantSchema>;
export type PhotoLayer = v.InferOutput<typeof PhotoLayerSchema>;
export type ScreenshotLayer = v.InferOutput<typeof ScreenshotLayerSchema>;
export type FrameLayer = v.InferOutput<typeof FrameLayerSchema>;
export type IconLayer = v.InferOutput<typeof IconLayerSchema>;
export type MarkLayer = v.InferOutput<typeof MarkLayerSchema>;
export type VideoLayer = v.InferOutput<typeof VideoLayerSchema>;
export type ClipLayer = v.InferOutput<typeof ClipLayerSchema>;
export type DocumentLayer = v.InferOutput<typeof DocumentLayerSchema>;
export type PostLayer = v.InferOutput<typeof PostLayerSchema>;
export type NoticeLayer = v.InferOutput<typeof NoticeLayerSchema>;

export function isLayerName(value: string): value is LayerName {
	return Object.hasOwn(LAYERS, value);
}

/**
 * What a bare resource id means, written as a scheme rather than as an address.
 *
 * An absolute URL here would bake a hostname into every record, so changing one would mean
 * rewriting all of them. A scheme is expanded by whoever answers, from `@canmi/urls`, which is
 * the one place a hostname is declared. `libs/fonts` already does this with `__CDN_URL__`.
 */
export const CANONICAL_PATTERN = /^(?:cid:[0-9a-f]{32}\.[a-z0-9]+|slug:[a-z0-9][a-z0-9-]*)$/;

/**
 * Six fields and a container, which is the whole record.
 *
 * `layers` is read loosely here on purpose: the envelope's job is to find the layers and say how
 * old each one is, and which schema a layer is then read under is its segment's to decide. A
 * strict object at this level would strip every field the register is about to ask for.
 */
export const ResourceSchema = v.object({
	version: v.literal(RESOURCE_VERSION),
	resource: rid,
	type: namespace,
	created: v.string(),
	updated: v.string(),
	// Optional because a resource declaring none is a refusal rather than a guess, and because
	// nothing wrote one before this field existed.
	canonical: v.optional(v.pipe(v.string(), v.regex(CANONICAL_PATTERN))),
	layers: v.record(v.string(), v.looseObject(layered)),
});

export type Resource = v.InferOutput<typeof ResourceSchema>;

/**
 * A canonical scheme expanded against the hosts this deployment knows.
 *
 * `cid:` names an object and `slug:` names an article, and neither carries a hostname -- which is
 * what lets a domain move without a record being touched. A slug needs no lookup: the site
 * resolves a bare name to the article's real path itself.
 */
export function expandCanonical(
	canonical: string,
	hosts: { cdn: string; site: string },
): string | undefined {
	const object = canonical.startsWith('cid:') ? canonical.slice(4) : undefined;
	if (object) return `${hosts.cdn}/object/${object}`;
	const slug = canonical.startsWith('slug:') ? canonical.slice(5) : undefined;
	return slug ? `${hosts.site}/${slug}` : undefined;
}

/** The segments of a type, in the order they narrow. `media.image.photo` is three claims. */
export function parseType(type: string): string[] {
	return type.split('.').filter((segment) => segment.length > 0);
}

/**
 * A record as this build understands it, which may be less than the record declares.
 *
 * `segments` is what parsed rather than what was claimed, so a consumer asking whether it got
 * what it needed asks that list and not `type`.
 */
export type ParsedResource = {
	resource: ResourceId;
	type: string;
	created: string;
	updated: string;
	segments: LayerName[];
	layers: { [N in LayerName]?: LayerOf<N> };
};

/**
 * Read a record for as much of it as this build knows, and stop rather than fall over.
 *
 * Both sides of a change are pushed together and the only skew is minutes, which does not justify
 * a compatibility contract -- it justifies not falling over. So an unknown segment or a layer
 * numbered too high ends the chain and keeps what came before it. See
 * spec/architecture/resource.md, "Parsing is optimistic, not compatible".
 */
export function parseResource(value: unknown): ParsedResource {
	const record = v.parse(ResourceSchema, value);
	const declared = parseType(record.type);
	// A layer nobody declared is data nothing can reach, which is the record being wrong rather
	// than this build being old -- the one shape that is an error before a caller asks anything.
	for (const held of Object.keys(record.layers)) {
		if (!declared.includes(held)) {
			throw new Error(
				`resource ${record.resource} holds layer ${held}, absent from ${record.type}`,
			);
		}
	}
	// Untyped while it is being filled: the key is a union and the value is whichever member that
	// key selects, and nothing pairs the two up per iteration except the register itself.
	const layers: Record<string, unknown> = {};
	const segments: LayerName[] = [];
	for (const segment of declared) {
		if (!isLayerName(segment)) break;
		const known = LAYERS[segment];
		const held = record.layers[segment];
		// A declared segment with nothing under it breaks the type's promise, and a layer numbered
		// above what is known is a shape from a newer producer. Neither is this reader's to repair.
		if (!held || held.version > known.version) break;
		layers[segment] = v.parse(known.schema, held);
		segments.push(segment);
	}
	return {
		resource: record.resource,
		type: record.type,
		created: record.created,
		updated: record.updated,
		segments,
		layers: layers as ParsedResource['layers'],
	};
}

/**
 * The layer a caller cannot proceed without, or an error naming what it got instead.
 *
 * The one strict reading in the file, and the difference is worth stating: everything above is "I
 * do not know about this", which is survivable, and this is "this is not the thing you asked
 * for", which is not. Answering it with a blank is how a missing image becomes a missing image
 * nobody reports. See spec/architecture/resource.md, "Parsing is optimistic, not compatible".
 */
export function requireSegment<N extends LayerName>(
	resource: ParsedResource,
	segment: N,
): LayerOf<N> {
	const layer = resource.layers[segment];
	if (!layer) {
		throw new Error(`resource ${resource.resource} is ${resource.type}, asked for ${segment}`);
	}
	return layer;
}

/** Step one: the intrinsic box, which every picture has. No branch and no decision. */
export function width(image: ImageLayer): number {
	return image.dimension.width;
}

export function height(image: ImageLayer): number {
	return image.dimension.height;
}

export function aspect(image: ImageLayer): string {
	return image.dimension.aspect;
}

/** Step three: actual pixels, and `null` for a vector, which has none to report. */
export function resolution(image: ImageLayer): { width: number; height: number } | null {
	return image.resolution ?? null;
}

/**
 * Whether this picture serves any size, which is the one place that knows which mimes scale.
 *
 * Asked of the variants because that is where a concrete mime is a fact; an absent `resolution`
 * says the same thing and covers a layer whose variants have not been derived yet.
 */
export function scalable(image: ImageLayer): boolean {
	return image.variants.some((file) => SCALABLE_MIMES.has(file.mime)) || !image.resolution;
}

/**
 * Step two, and the point of the other three: whether this can serve a target long edge.
 *
 * **The branch lives here.** A caller drawing a thumbnail never gets further than this line and
 * never learns that formats exist, which is what keeps `scalable` from being a condition repeated
 * in every caller. See spec/architecture/resource.md, "The image layer answers in four steps".
 */
export function enough(image: ImageLayer, want: number): boolean {
	if (scalable(image)) return true;
	const pixels = resolution(image);
	return pixels !== null && Math.max(pixels.width, pixels.height) >= want;
}

// A variant with no pixel count is scalable and serves any target, so it sorts above everything
// measurable and is only reached when nothing with pixels is large enough.
function longEdge(file: ImageVariant): number {
	return file.resolution ? Math.max(file.resolution.width, file.resolution.height) : Infinity;
}

/**
 * Step four: the file to serve for a target long edge.
 *
 * The smallest rung that covers the target, because anything larger is weight a reader pays for
 * and nobody sees; the largest when none of them does, since upscaling is never done and the top
 * rung is the best answer that exists. See spec/architecture/media.md, "Variants stop where the
 * layout does".
 */
export function best(image: ImageLayer, want: number): ImageVariant | undefined {
	const vector = image.variants.find((file) => SCALABLE_MIMES.has(file.mime));
	if (vector) return vector;
	const rungs = [...image.variants].sort((a, b) => longEdge(a) - longEdge(b));
	return rungs.find((file) => longEdge(file) >= want) ?? rungs[rungs.length - 1];
}

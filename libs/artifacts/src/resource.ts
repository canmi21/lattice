/**
 * The resource record: its envelope, the id that names it, and every layer a resource can carry.
 * See spec/architecture/resource.md.
 */
import * as v from 'valibot';
import { byLocale, hash } from './schema.ts';

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
export const SCALABLE_MIMES = new Set(['image/svg+xml']);

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
	 * Base64 thumbhash: the compact canonical placeholder, and what `placeholder` decodes from.
	 *
	 * Optional, because a picture is not the only thing this layer describes. An icon binds two
	 * files under `icon` and has no single picture to stand in for -- **absent is the answer**
	 * there, exactly as it is for `resolution`, and a placeholder invented for one of the two
	 * tones would be painted under the other.
	 */
	thumbhash: v.optional(v.string()),
	/**
	 * The same placeholder decoded, as a `data:image/webp` URI a page paints directly.
	 *
	 * Carried rather than derived where it is wanted, and the reason is not size: this record is
	 * read by a **universal** load, and the decode is a WebP codec reached through `node:fs`,
	 * which no browser bundle may contain. One decode at import serves both halves. Measured at
	 * 167 characters median here, about 8% of a photograph's record. Additive, so the layer
	 * keeps its version -- see the parsing table in spec/architecture/resource.md.
	 */
	placeholder: v.optional(v.string()),
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
 * Spread into two layers rather than named as one, because `apps/local/src/image/exif.rs` is
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

/** Which shade an icon is drawn for. Closed, and the axis this layer exists to carry. */
export const TONES = ['light', 'dark'] as const;
export type Tone = (typeof TONES)[number];

/**
 * Another site's mark: one resource per domain, one file per tone.
 *
 * Light and dark are two pictures, not two encodings of one, so they bind here and not in
 * `image.variants`. Each is described as an image variant is; what differs is the axis. A site
 * with one mark carries one key, and absence is the answer as it is for `resolution`. See
 * spec/architecture/resource.md, "Content binds at the layer that has it".
 */
export const IconLayerSchema = v.pipe(
	v.object({
		...layered,
		domain: v.string(),
		tones: v.object({
			light: v.optional(ImageVariantSchema),
			dark: v.optional(ImageVariantSchema),
		}),
	}),
	// A resource that is an icon and names no file is a record with nothing in it -- not a state
	// the collector can reach, and one a reader could only answer with a blank.
	v.check((icon) => TONES.some((tone) => icon.tones[tone]), 'an icon names no file for any tone'),
);

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
export const ArticleLayerSchema = v.object({
	...layered,
	// `published` is optional here and required in the root, because this layer has a producer of
	// its own and records it wrote before the field existed must keep parsing: a layer that fails
	// validation fails the whole record rather than stopping at that segment. Declared all the
	// same, since a `v.object` drops what it does not declare -- so leaving it out would silently
	// swallow the field the day something does write it.
	dates: v.object({
		created: v.string(),
		published: v.optional(v.string()),
		lastmod: v.string(),
	}),
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
	article: { version: 1, schema: ArticleLayerSchema },
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
export type ArticleLayer = v.InferOutput<typeof ArticleLayerSchema>;
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

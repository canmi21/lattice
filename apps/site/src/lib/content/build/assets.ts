/**
 * Resolving an image reference into everything the markup needs, at build time.
 *
 * An article names a resource and the manifest holds what was derived from it, so a page can
 * carry an exact `srcset` and its own placeholder without the images being present in the
 * repository or a single request being made to discover their dimensions.
 *
 * Which kind of thing a reference found is the record's own chain to say: a picture answers
 * under `image` and a clip under `video`, and each resolver here refuses the other's kind
 * rather than half-reading it. A diagram is resolved here too and is not an asset at all -- an
 * article carries its source inline -- but the question is the same one: what does this picture
 * say, in this view's language.
 */
import {
	aspect,
	best,
	height,
	isResourceId,
	parseResource,
	requireSegment,
	width,
	type ImageLayer,
	type ParsedResource,
	type VideoLayer,
} from '@canmi/artifacts';
import type { VideoRung, VideoTrack } from '@canmi/artifacts/types';

import { sourceFingerprint } from './assemble.ts';

/**
 * What a published variant's file is called, keyed by what it holds.
 *
 * Exported so a test can hold it to the Rust side that names the files. The two are one fact in
 * two languages: apps/cms writes the name, this rebuilds it, and a disagreement shows up only as
 * a redirect nobody notices.
 */
export const EXTENSION: Record<string, string> = {
	'image/avif': 'avif',
	'image/webp': 'webp',
	'image/png': 'png',
	// `jpeg`, matching what apps/cms names the file. The CDN redirects `.jpg` away, and a link
	// built here should not be the thing taking that hop.
	'image/jpeg': 'jpeg',
};

/**
 * What a published rung and a published text track are called.
 *
 * Apart from `EXTENSION` above rather than folded into it: that table is held to `apps/cms`'s
 * `for_variant` by a test that reads only its `image/*` arms, and these two are not variants of a
 * picture. One format each, which is spec/architecture/video/pipeline.md's whole point -- AV1 in
 * MP4, and WebVTT beside it.
 */
export const MEDIA_EXTENSION: Record<string, string> = {
	'video/mp4': 'mp4',
	'text/vtt': 'vtt',
};

export type Resolved = {
	src: string;
	srcset: string;
	width: number;
	height: number;
	ratio: string;
	preview: string;
	/**
	 * What the image shows, from the manifest.
	 *
	 * Baked in at build time for the same reason the placeholder is: it belongs to the picture,
	 * so every article referencing it inherits the same words without repeating them, and a
	 * description written after the article still reaches it on the next build.
	 *
	 * Absent for an asset nobody has described yet. That is a gap `cms check` reports, not
	 * something to paper over with the filename.
	 */
	description?: string;
};

/**
 * Every record this build could read, under both of the ids one is asked for by.
 *
 * Two maps built in one pass rather than a scan per lookup. A rid names the thing and an
 * original's cid names bytes it was made from; nothing converts one into the other, so both are
 * indexed and the reference decides which is consulted. See spec/architecture/resource.md.
 */
export type AssetLibrary = {
	byResource: Map<string, ParsedResource>;
	byOrigin: Map<string, ParsedResource>;
};

/**
 * Read `data/record/metadata.json` into that library, refusing the shape from before the ids.
 *
 * The refusal is the point: a record with no `layers` is a manifest that has not been through
 * `cms migrate`, and reading it optimistically would resolve every picture to nothing -- which
 * is how a whole corpus of missing images arrives with nobody told. The twin of the loader in
 * `apps/cms/src/image/manifest.rs`, which refuses the same shape in the same words.
 */
export function readAssets(manifest: unknown): AssetLibrary {
	const { media = {} } = (manifest ?? {}) as { media?: Record<string, unknown> };
	const library: AssetLibrary = { byResource: new Map(), byOrigin: new Map() };
	for (const [key, record] of Object.entries(media)) {
		if (typeof record !== 'object' || record === null || !('layers' in record)) {
			throw new Error(`\`${key}\` has no resource id -- run \`cms migrate\` first`);
		}
		const asset = parseResource(record);
		library.byResource.set(asset.resource, asset);
		// Every original rather than the newest alone: re-scanning a subject adds one to the
		// list, and an article written before that scan still names the cid it was imported as.
		for (const origin of requireSegment(asset, 'media').origin) {
			library.byOrigin.set(origin.blake3, asset);
		}
	}
	return library;
}

export type MediaManifest = {
	media: Record<
		string,
		{
			description?: Record<string, { text: string }>;
			/**
			 * Where the asset came from, as a person wrote it. A claim rather than a derivation,
			 * which is why it is in `media.yaml` and not in the manifest -- see
			 * spec/architecture/media.md. It is what the unsupported-format notice links to.
			 */
			source?: { url: string; label?: string };
		}
	>;
};

/**
 * A reference that has been through the pipeline, in both the forms a corpus holds.
 *
 * `{cid}.{ext}` is what an article named before the ids, and that cid is an original's. A rid
 * carries no extension at all, which is what says it is one: which format gets served is the
 * build's decision now. The twin of `resolved` and `resource` in `apps/cms/src/refs.rs`, which
 * answers the same two forms for the commands on that side.
 */
const RESOLVED = /^([0-9a-f]{32})\.[a-z0-9]+$/;

function found(library: AssetLibrary, reference: string): ParsedResource | undefined {
	const value = reference.split('/').pop() ?? reference;
	if (isResourceId(value)) return library.byResource.get(value);
	const cid = RESOLVED.exec(value)?.[1];
	return cid ? library.byOrigin.get(cid) : undefined;
}

/**
 * What `media.yaml` says about a resource, in the view being compiled.
 *
 * Found by the original's cid and not by the rid: that file is authored beside the record and
 * is still filed the way it always was, which `origin_cid` in `apps/cms/src/image/manifest.rs`
 * is the same lookup for on that side.
 */
function entryOf(
	asset: ParsedResource,
	media: MediaManifest,
): MediaManifest['media'][string] | undefined {
	const cid = requireSegment(asset, 'media').origin.at(-1)?.blake3;
	return cid ? media.media[cid] : undefined;
}

function url(cdnUrl: string, cid: string, mime: string): string {
	return `${cdnUrl}/image/${cid}.${EXTENSION[mime] ?? 'avif'}`;
}

/**
 * Where a published rung or track is asked for: a prefix naming what kind of object it is, the
 * content id, and the extension that says which representation is wanted.
 *
 * Flat, with no fanout. The bucket keys carry two levels of it and the URL does not: one names
 * what the reader wants and the worker decides where to read from. See
 * spec/architecture/media.md.
 */
function published(cdnUrl: string, prefix: string, cid: string, mime: string): string {
	const extension = MEDIA_EXTENSION[mime];
	return extension ? `${cdnUrl}/${prefix}/${cid}.${extension}` : `${cdnUrl}/${prefix}/${cid}`;
}

/**
 * The variants a `srcset` can name, smallest first.
 *
 * Only the ones with pixels, because a `w` descriptor is a pixel count and a vector has none to
 * state -- it is the `src`, and one file that serves every width needs no candidates beside it.
 * Which mimes those are is the image layer's to know and never this file's; see
 * spec/architecture/resource.md, "The image layer answers in four steps".
 */
function rungs(image: ImageLayer): { content: string; mime: string; width: number }[] {
	return image.variants
		.flatMap((file) => (file.resolution ? [{ ...file, width: file.resolution.width }] : []))
		.toSorted((a, b) => a.width - b.width);
}

/**
 * Every diagram the CMS has described, keyed by the checksum of the source that draws it.
 *
 * Not by the record's own key, which is a BLAKE3 content id: computing one here would put a
 * second implementation of the article hash back into TypeScript, which is the duplication the
 * segment layout exists to remove. The record carries the same cheap FNV-1a the layout uses, over
 * the block's exact source bytes, and this side recomputes that in the four lines it already has.
 */
export type DiagramStore = {
	diagrams: Record<
		string,
		{ fingerprint?: string; description?: Record<string, { text: string }> }
	>;
};

/**
 * What a diagram says, in the view being compiled, by the block that draws it.
 *
 * The argument is the block's source exactly as the article holds it. A fence could have been
 * found by its payload and a directive could not -- a directive has no `value` to hand over,
 * only children a parser has already taken apart -- so both are keyed the way the CMS writes.
 *
 * The locale is the same choice the asset resolver makes and for the same reason: a diagram on
 * the original view is described beside prose in the article's own language.
 */
export function createDiagramResolver(
	store: DiagramStore,
	descriptionLocale = 'en-US',
): (source: string) => string | undefined {
	const byFingerprint = new Map<string, string>();
	for (const entry of Object.values(store.diagrams ?? {})) {
		const text = entry.description?.[descriptionLocale]?.text?.trim();
		if (entry.fingerprint && text) byFingerprint.set(entry.fingerprint, text);
	}
	const encoder = new TextEncoder();
	return (source) => byFingerprint.get(sourceFingerprint(encoder.encode(source)));
}

/**
 * Everything the markup needs about a picture, or null for a reference nothing resolves.
 *
 * Null is what an article written before its image was imported gets, and the caller falls back
 * to a plain `img` so the page still renders rather than failing the build. A clip named where
 * a picture belongs gets the same answer: the chain says which kind of thing was found, and
 * half-reading the other kind is what produced a broken `srcset` rather than a fallback.
 */
export function createAssetResolver(
	assets: AssetLibrary,
	media: MediaManifest,
	previews: ReadonlyMap<string, string>,
	/**
	 * Which CDN the markup should name.
	 *
	 * Passed rather than picked. This runs at build time, and which CDN answers depends on the
	 * mode -- a development build that named production would send a reader to bytes the local
	 * tree has not published, and hide the ones it has. The same reason the font stylesheets
	 * carry `__CDN_URL__` instead of a host. See spec/architecture/workspace.md.
	 */
	cdnUrl: string,
	descriptionLocale = 'en-US',
): (reference: string) => Resolved | null {
	return (reference) => {
		const asset = found(assets, reference);
		const image = asset?.layers.image;
		if (!asset || !image) return null;

		// The file to serve at the picture's own size, which is the largest rung that is never
		// enlarged -- asked of the layer rather than worked out here, so nothing in this file has
		// to know which mimes scale. A picture with no variants derived yet has no answer.
		const file = best(image, width(image));
		if (!file) return null;

		return {
			src: url(cdnUrl, file.content, file.mime),
			srcset: rungs(image)
				.map((rung) => `${url(cdnUrl, rung.content, rung.mime)} ${rung.width}w`)
				.join(', '),
			// The intrinsic box, not the chosen variant's: they share an aspect, and this is what
			// the browser needs to reserve the right space before anything loads.
			width: width(image),
			height: height(image),
			ratio: aspect(image),
			preview: previews.get(image.thumbhash) ?? '',
			// media.yaml owns these translations independently from article segments. Selecting the
			// matching value here makes each compiled view carry its own accessible fallback text.
			description: entryOf(asset, media)?.description?.[descriptionLocale]?.text,
		};
	};
}

/**
 * One published rung: the bytes, and the exact string a `<source>` is chosen by.
 *
 * The dimensions travel with it because they are the only thing the chooser at hydration has to
 * decide on -- `<source>` is selected by `type` and never by size, so nothing in the markup can
 * express what `srcset` expresses for a picture. See the component.
 */

export type ResolvedVideo = {
	/** Every rung, smallest first. That order is the markup's, and the component argues for it. */
	rungs: VideoRung[];
	/** The original's dimensions, which is the box to reserve before anything is fetched. */
	width: number;
	height: number;
	/** The poster image asset's own rendition. Absent for a poster nobody has imported. */
	poster?: string;
	/** The poster's placeholder, painted under it while it arrives. */
	preview?: string;
	captions: VideoTrack[];
	/**
	 * What the clip shows, from `media.yaml`, in this view's language.
	 *
	 * The clip's own, written by `cms describe` from frames this repository chose. Not the
	 * poster's, which describes one frame and has nowhere to go: `poster` is an attribute, not an
	 * element, and it takes no alternative text. See spec/architecture/video/pipeline.md.
	 */
	description?: string;
	/** Where the clip came from. The unsupported-format notice is the only thing that reads it. */
	source?: { url: string; label?: string };
	/**
	 * The constant every sample of this clip is multiplied by, so two clips play at one level.
	 *
	 * Computed here rather than in the player: arithmetic over two stored numbers, with no reason
	 * to run in a browser. `1` for a clip with nothing measured, which plays as it always did.
	 *
	 * See spec/architecture/video/pipeline.md, "Every clip plays at one level, and the peak is what
	 * caps it", for why one constant gain rather than a limiter.
	 */
	gain: number;
};

/**
 * The level every clip is brought to, in LUFS, and the ceiling no clip may pass, in dBTP.
 *
 * `-1` dBTP rather than `0`: a sample at full scale is not the loudest a signal reaches, since
 * the waveform between two samples can go higher, and the decoder that reconstructs it clips
 * where the samples did not. A decibel of headroom is the usual allowance.
 *
 * See spec/architecture/video/pipeline.md, "Every clip plays at one level, and the peak is what
 * caps it", for why the target sits at the loud end of the corpus.
 */
const LOUDNESS_TARGET = -18;
const PEAK_CEILING = -1;

/**
 * How much to multiply a clip by: what the loudness asks for, capped by what the peak allows.
 *
 * Both are decibel differences turned into ratios. The smaller wins, so a quiet clip climbs
 * towards the target and stops at the point where its loudest instant would distort -- measured
 * on this corpus, one clip wants 1.93 and is held to 1.81 by its own peak.
 */
function levelling(source: VideoLayer['source']): number {
	if (source.loudness === undefined || source.peak === undefined) return 1;
	const byLoudness = 10 ** ((LOUDNESS_TARGET - source.loudness) / 20);
	const byPeak = 10 ** ((PEAK_CEILING - source.peak) / 20);
	return Math.min(byLoudness, byPeak);
}

/**
 * Resolving a `::video` reference into everything the markup needs.
 *
 * The poster goes back through the image resolver rather than being addressed directly, because
 * a poster is an ordinary picture with its own id, its own rungs and its own placeholder --
 * spec/architecture/video/pipeline.md's reason for storing it as one. Anything true of a picture
 * here is therefore true of a poster without being said twice.
 */
export function createVideoResolver(
	assets: AssetLibrary,
	media: MediaManifest,
	previews: ReadonlyMap<string, string>,
	/** Which CDN the markup should name; see createAssetResolver. */
	cdnUrl: string,
	descriptionLocale = 'en-US',
): (reference: string) => ResolvedVideo | null {
	const resolvePoster = createAssetResolver(assets, media, previews, cdnUrl, descriptionLocale);
	return (reference) => {
		const asset = found(assets, reference);
		const video = asset?.layers.video;
		if (!asset || !video) return null;

		// A rid, which is what makes this a reference like any other: the cover is a resource of
		// its own, and the resolver above answers it without being told it is a poster.
		const poster = resolvePoster(video.cover);
		const entry = entryOf(asset, media);
		return {
			// By height, because a tier is one axis: a vertical clip sorted by width snaps to the
			// wrong order. See spec/architecture/video/pipeline.md.
			rungs: video.variants
				.toSorted((a, b) => a.resolution.height - b.resolution.height)
				.map((variant) => ({
					src: published(cdnUrl, 'video', variant.content, variant.mime),
					// The full codec string, not the bare container type. `<source>` is selected on
					// this alone, so `video/mp4` would claim every browser can play the file and
					// hand AV1 to one that cannot; with the codec named, a browser that cannot
					// decode it rejects the source itself and fetches nothing.
					type: `${variant.mime}; codecs="${variant.codec}"`,
					width: variant.resolution.width,
					height: variant.resolution.height,
				})),
			width: video.source.width,
			height: video.source.height,
			// The largest rendition. `poster` takes one URL and has no `srcset`, so one has to be
			// chosen here rather than by the browser, and the largest is the only one that is
			// never enlarged -- an AVIF still costs tens of kilobytes at any of them.
			poster: poster?.src,
			preview: poster?.preview,
			captions: video.tracks.map((track) => ({
				src: published(cdnUrl, 'captions', track.content, track.mime),
				kind: track.kind,
				language: track.language,
			})),
			description: entry?.description?.[descriptionLocale]?.text,
			source: entry?.source,
			gain: levelling(video.source),
		};
	};
}

/**
 * Resolving an image reference into everything the markup needs, at build time.
 *
 * Articles reference an image by the content id of its original. The manifest holds the
 * variants derived from it, so the page can carry an exact `srcset` and its own placeholder
 * without the images being present in the repository or a single request being made to
 * discover their dimensions.
 *
 * A video comes out of the same manifest by the same id, with `type` as the discriminant: its
 * rungs, poster and text tracks come back where a picture's variants and thumbhash would. A
 * diagram is resolved here too and is not an asset at all -- an article carries its source
 * inline -- but the question is the same one, asked of the same kind of record: what does this
 * picture say, in this view's language.
 */

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
 * A picture's record, as `data/metadata.json` holds it.
 *
 * Only the fields the markup needs are declared. The record carries EXIF, byte counts and the
 * quality each variant was encoded at, and none of them reaches a page.
 */
type ImageRecord = {
	type: 'image';
	thumbhash: string;
	source: {
		width: number;
		height: number;
		ratio: string;
		/** Integrated loudness in LUFS and true peak in dBTP, when apps/cms has measured them. */
		loudness?: number;
		peak?: number;
	};
	variants: Record<string, { mime: string; width: number }>;
};

/**
 * A clip's record, which is a different shape rather than a picture's with holes in it.
 *
 * `duration`, `frameRate`, `frames` and `audio` are on the record and deliberately not here.
 * Nothing renders them today: the frame count is the denominator of the progress bar the
 * software-decode path would show, and that path is decided and not built. See
 * spec/architecture/video/pipeline.md.
 */
type VideoRecord = {
	type: 'video';
	source: {
		width: number;
		height: number;
		ratio: string;
		/** Integrated loudness in LUFS and true peak in dBTP, when apps/cms has measured them. */
		loudness?: number;
		peak?: number;
	};
	/** The content id of the poster frame, which is an ordinary image asset with its own record. */
	poster: string;
	variants: Record<string, { mime: string; width: number; height: number; codec: string }>;
	captions?: Record<string, { mime: string; language: string; kind: CaptionKind }>;
};

/**
 * What a text track is. HTML's own set, narrowed to the three a clip here can carry.
 *
 * Trusted off the record rather than checked, the same way a `mime` is trusted to index the
 * tables above: apps/cms writes this field from a closed set, and a fourth value arriving here
 * is a change on that side to make deliberately rather than something to repair on this one.
 */
export type CaptionKind = 'captions' | 'subtitles' | 'descriptions';

export type AssetManifest = {
	media: Record<string, ImageRecord | VideoRecord>;
};

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

/** Strip any extension an article wrote, leaving the content id. */
function idOf(reference: string): string {
	return (
		reference
			.split('/')
			.pop()
			?.replace(/\.[a-z0-9]+$/i, '') ?? reference
	);
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
 * The variants of an image, ordered by width, as a `srcset` plus the largest as `src`.
 *
 * Returns null for a reference the manifest does not know, which is what happens to an
 * article written before its image was imported. The caller falls back to a plain `img` so
 * the page still renders rather than failing the build.
 */
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

export function createAssetResolver(
	assets: AssetManifest,
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
		const id = idOf(reference);
		const asset = assets.media[id];
		// A clip named where a picture belongs resolves to nothing rather than to a broken
		// `srcset`, and the caller falls back the same way it does for an id nobody has imported.
		if (!asset || asset.type === 'video') return null;

		const variants = Object.entries(asset.variants).toSorted(([, a], [, b]) => a.width - b.width);
		const largest = variants.at(-1);
		if (!largest) return null;

		return {
			src: url(cdnUrl, largest[0], largest[1].mime),
			srcset: variants.map(([cid, v]) => `${url(cdnUrl, cid, v.mime)} ${v.width}w`).join(', '),
			// The original's dimensions, not the largest variant's: they share a ratio, and this is
			// what the browser needs to reserve the right box before anything loads.
			width: asset.source.width,
			height: asset.source.height,
			ratio: asset.source.ratio,
			preview: previews.get(asset.thumbhash) ?? '',
			// media.yaml owns these translations independently from article segments. Selecting the
			// matching value here makes each compiled view carry its own accessible fallback text.
			description: media.media[id]?.description?.[descriptionLocale]?.text,
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
export type VideoRung = { src: string; type: string; width: number; height: number };

/** One published text track, described by what the record says it is rather than by a label. */
export type VideoTrack = { src: string; kind: CaptionKind; language: string };

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
function levelling(source: VideoRecord['source']): number {
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
	assets: AssetManifest,
	media: MediaManifest,
	previews: ReadonlyMap<string, string>,
	/** Which CDN the markup should name; see createAssetResolver. */
	cdnUrl: string,
	descriptionLocale = 'en-US',
): (reference: string) => ResolvedVideo | null {
	const resolvePoster = createAssetResolver(assets, media, previews, cdnUrl, descriptionLocale);
	return (reference) => {
		const id = idOf(reference);
		const asset = assets.media[id];
		if (asset?.type !== 'video') return null;

		const poster = resolvePoster(asset.poster);
		const entry = media.media[id];
		return {
			// By height, because a tier is one axis: a vertical clip sorted by width snaps to the
			// wrong order. See spec/architecture/video/pipeline.md.
			rungs: Object.entries(asset.variants)
				.toSorted(([, a], [, b]) => a.height - b.height)
				.map(([cid, variant]) => ({
					src: published(cdnUrl, 'video', cid, variant.mime),
					// The full codec string, not the bare container type. `<source>` is selected on
					// this alone, so `video/mp4` would claim every browser can play the file and
					// hand AV1 to one that cannot; with the codec named, a browser that cannot
					// decode it rejects the source itself and fetches nothing.
					type: `${variant.mime}; codecs="${variant.codec}"`,
					width: variant.width,
					height: variant.height,
				})),
			width: asset.source.width,
			height: asset.source.height,
			// The largest rendition. `poster` takes one URL and has no `srcset`, so one has to be
			// chosen here rather than by the browser, and the largest is the only one that is
			// never enlarged -- an AVIF still costs tens of kilobytes at any of them.
			poster: poster?.src,
			preview: poster?.preview,
			captions: Object.entries(asset.captions ?? {}).map(([cid, caption]) => ({
				src: published(cdnUrl, 'captions', cid, caption.mime),
				kind: caption.kind,
				language: caption.language,
			})),
			description: entry?.description?.[descriptionLocale]?.text,
			source: entry?.source,
			gain: levelling(asset.source),
		};
	};
}

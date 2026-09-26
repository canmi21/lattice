/**
 * Choosing what to draw out of an image or icon layer: its size, the variant that covers a width,
 * the tone that suits a ground, and the picture a page renders for a rid. See
 * spec/architecture/resource.md.
 */
import {
	type IconLayer,
	type ImageLayer,
	type ImageVariant,
	type ParsedResource,
	requireSegment,
	SCALABLE_MIMES,
	type Tone,
} from './resource.ts';
import type { Block } from './types.ts';

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

/**
 * What an icon's file is spelled with, keyed by what is in it.
 *
 * Its own table rather than the variant one, for the reason `for_icon` is its own on the other
 * side: these bytes were encoded by somebody else's server and arrive as SVG or ICO, neither of
 * which a ladder ever produces -- and the ladder's table answers `avif` for anything it does not
 * recognise, which would be an address to a file nobody wrote. The twin of `icon_mime` in
 * apps/local/src/extension.rs, held to it by a test here.
 */
export const ICON_EXTENSION: Record<string, string> = {
	'image/svg+xml': 'svg',
	'image/png': 'png',
	'image/jpeg': 'jpeg',
	'image/x-icon': 'ico',
};

/**
 * Which of an icon's files answers for a tone, and `undefined` when none does.
 *
 * A named tone is that tone or nothing: a caller handed the other one cannot tell it happened,
 * and would draw a light mark on a dark surface believing it had the right one. With none named
 * either will do, light first, an untinted mark being drawn for light backgrounds. The one place
 * that rule is written on this side, having been the alias layer's until an icon became a
 * resource.
 */
export function toned(icon: IconLayer, want?: Tone): ImageVariant | undefined {
	return want ? icon.tones[want] : (icon.tones.light ?? icon.tones.dark);
}

/**
 * What a published variant's file is called, keyed by what it holds.
 *
 * Beside `ICON_EXTENSION` rather than folded into it, for the reason that table gives: a ladder
 * produces these four and never an SVG or an ICO, and answering `avif` for a mime it does not
 * recognise would be a guess an icon cannot afford. Held to `for_variant` in
 * apps/local/src/extension.rs by a test, the two being one fact in two languages.
 */
export const VARIANT_EXTENSION: Record<string, string> = {
	'image/avif': 'avif',
	'image/webp': 'webp',
	'image/png': 'png',
	// `jpeg`, matching what apps/local names the file. These are object addresses, and `/object`
	// forms a key from the name rather than correcting it -- so a link built here spelling it
	// `jpg` is a 404, not the hop `/derive` grants a target.
	'image/jpeg': 'jpeg',
};

/**
 * Where one published file is fetched from: the content id and the extension that says how to
 * read it, under `/object` like every other byte the CDN holds.
 *
 * Here rather than in each caller because the resolution that used to happen at build time now
 * happens in three places -- a build writing the markdown target's address, a Worker rendering a
 * page, a browser rendering the same page again -- and a URL spelled three ways is three chances
 * to spell it wrong. The CDN is passed rather than picked: which one answers depends on the mode.
 */
export function objectUrl(cdnUrl: string, cid: string, extension: string): string {
	return `${cdnUrl}/object/${cid}.${extension}`;
}

/**
 * The variants a `srcset` can name, smallest first.
 *
 * Only the ones with pixels, because a `w` descriptor is a pixel count and a vector has none to
 * state -- it is the `src`, and one file that serves every width needs no candidates beside it.
 */
export function rungs(image: ImageLayer): (ImageVariant & { width: number })[] {
	return image.variants
		.flatMap((file) => (file.resolution ? [{ ...file, width: file.resolution.width }] : []))
		.toSorted((a, b) => a.width - b.width);
}

/** Everything the markup needs about one picture, from the record and the CDN alone. */
export type Picture = {
	src: string;
	srcset: string;
	/** The intrinsic box, which is what reserves the space before anything is fetched. */
	width: number;
	height: number;
	ratio: string;
	/** The colour block painted under it while it arrives. Absent for a record holding no hash. */
	placeholder?: string;
};

/**
 * Which of a resource's files a picture is drawn from, and the refusal when it is not one.
 *
 * The second per-kind selector, beside `toned`, and one thing separates them: **a mark that does
 * not resolve is absent and a picture that does not is an error.** A card's foot loses an
 * ornament and still says where the link goes; an article loses what the paragraph is about, and
 * a blank there is how a missing image becomes one nobody reports. So this throws, where the
 * build refuses only what its committed manifest does not know -- spec/architecture/resource.md.
 */
export function pictured(rid: string, record: ParsedResource | undefined, cdnUrl: string): Picture {
	if (!record) throw new Error(`no record for resource ${rid}, which an article draws`);
	const image = requireSegment(record, 'image');
	// The file to serve at the picture's own size, which is the largest rung that is never
	// enlarged -- asked of the layer, so nothing here has to know which mimes scale.
	const file = best(image, width(image));
	if (!file) throw new Error(`resource ${rid} publishes no file to draw`);
	return {
		src: objectUrl(cdnUrl, file.content, VARIANT_EXTENSION[file.mime] ?? 'avif'),
		srcset: rungs(image)
			.map(
				(rung) =>
					`${objectUrl(cdnUrl, rung.content, VARIANT_EXTENSION[rung.mime] ?? 'avif')} ${rung.width}w`,
			)
			.join(', '),
		// The intrinsic box, not the chosen variant's: they share an aspect, and this is what the
		// browser needs to reserve the right space before anything loads.
		width: width(image),
		height: height(image),
		ratio: aspect(image),
		placeholder: image.placeholder,
	};
}

/**
 * Every rid the blocks of one view name, each asked for once.
 *
 * A block declares its resources under a key that says so, and this reads that key and nothing
 * else. What it replaces was a switch over block types, kept in the page that renders them,
 * which grew an arm for every block that came to name one. The shape is what fixes that: with
 * the roles on the block there is no list here to grow. Deduplicated, because two pictures of
 * one subject are one question -- spec/architecture/resource.md, "One question per page".
 */
export function namedResources(blocks: readonly Block[]): string[] {
	return [
		...new Set(
			blocks.flatMap((block) => ('resources' in block ? Object.values(block.resources ?? {}) : [])),
		),
	];
}

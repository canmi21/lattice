import decodeAvif, { init as initAvifDecode } from '@jsquash/avif/decode';
import AVIF_DEC_WASM from '@jsquash/avif/codec/dec/avif_dec.wasm';
import encodeAvif, { init as initAvifEncode } from '@jsquash/avif/encode';
import AVIF_ENC_WASM from '@jsquash/avif/codec/enc/avif_enc.wasm';
import encodeJpeg, { init as initJpegEncode } from '@jsquash/jpeg/encode';
import JPEG_ENC_WASM from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm';
import decodePng, { init as initPngDecode } from '@jsquash/png/decode';
import encodePng, { init as initPngEncode } from '@jsquash/png/encode';
// Unlike the other three codecs, this one ships a wasm-bindgen declaration describing the
// module's own exports. What arrives here is whatever the bundler substitutes for the
// import, and wrangler substitutes a compiled WebAssembly.Module.
// @ts-expect-error -- the shipped .d.ts describes the wasm's exports, not the bundler's.
import PNG_WASM from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
import encodeWebp, { init as initWebpEncode } from '@jsquash/webp/encode';
import WEBP_ENC_WASM from '@jsquash/webp/codec/enc/webp_enc.wasm';

/**
 * Re-encoding a stored image into another format, here rather than at the edge -- the pipeline
 * cannot read the stored format at all, see spec/architecture/delivery.md, "Formats are
 * produced here, not at the edge", for the measurement -- so the worker decodes and re-encodes
 * itself, which removes the plan tier, the monthly quota and the dimension ceiling too.
 *
 * Decoders for what is stored, encoders for what can be asked for. `/derive` is the one route
 * that asks, and it names its source rather than probing, so every encoder here is reachable.
 */

/**
 * workerd has no DOM, and the codecs exchange pixels as `ImageData`.
 *
 * Its shape is declared in worker-runtime.d.ts, so this assignment type-checks against what it
 * actually installs. It used to need a `@ts-expect-error`: the DOM library was in scope and the
 * class below is not a browser `ImageData`, which the checker was right about.
 */
if (typeof globalThis.ImageData === 'undefined') {
	globalThis.ImageData = class {
		data: Uint8ClampedArray;
		width: number;
		height: number;
		colorSpace = 'srgb';

		constructor(data: Uint8ClampedArray | number, width: number, height?: number) {
			if (typeof data === 'number') {
				this.width = data;
				this.height = width;
				this.data = new Uint8ClampedArray(this.width * this.height * 4);
			} else {
				this.data = data;
				this.width = width;
				this.height = height ?? 0;
			}
		}
	};
}

/**
 * A codec is initialised once per isolate, and only if something asks for it.
 *
 * Instantiating all four at module scope would put the cost on every request, including the
 * overwhelming majority that read a stored AVIF and never transcode anything.
 */
function once(start: () => Promise<unknown>): () => Promise<void> {
	let running: Promise<void> | undefined;
	return () => {
		running ??= start().then(() => undefined);
		return running;
	};
}

const readyAvifDecode = once(() => initAvifDecode(AVIF_DEC_WASM));
const readyPngDecode = once(() => initPngDecode(PNG_WASM));
const readyPngEncode = once(() => initPngEncode(PNG_WASM));
const readyJpegEncode = once(() => initJpegEncode(JPEG_ENC_WASM));
const readyAvifEncode = once(() => initAvifEncode(AVIF_ENC_WASM));
const readyWebpEncode = once(() => initWebpEncode(WEBP_ENC_WASM));

/**
 * What a stored object can be.
 *
 * `jpg` is deliberately not a member -- see spec/architecture/delivery.md, "The extension asks
 * for a format", for why one spelling stays one.
 */
export const DECODABLE = ['avif', 'png'] as const;

/** What `/derive` may be asked to produce, which is every encoder this worker carries. */
export const DERIVABLE = ['webp', 'jpeg', 'png', 'avif'] as const;

export type Decodable = (typeof DECODABLE)[number];
export type Derivable = (typeof DERIVABLE)[number];

/**
 * What a re-encoded response is served as.
 *
 * Keyed by `Derivable`, not by string, so the table is complete by construction. Typed loosely
 * before, an indexed lookup returned `string | undefined` and the missing case silently fell
 * back to `image/jpeg` -- wrong for anything that was not JPEG. Adding a format without its
 * MIME type is now a compile error instead.
 */
export const MEDIA_TYPES: Record<Derivable, string> = {
	webp: 'image/webp',
	jpeg: 'image/jpeg',
	png: 'image/png',
	avif: 'image/avif',
};

/**
 * Quality for the fallback formats.
 *
 * These are mostly served to a browser that cannot read AVIF, so they are a compatibility path
 * rather than the one being optimised. High enough that the fallback is not visibly worse than
 * the image everyone else gets.
 */
const QUALITY = 80;

/** The same intent on AVIF's own scale, where the codec's default sits at 50. */
const AVIF_QUALITY = 50;

export function isDecodable(extension: string): extension is Decodable {
	return (DECODABLE as readonly string[]).includes(extension);
}

export function isDerivable(extension: string): extension is Derivable {
	return (DERIVABLE as readonly string[]).includes(extension);
}

async function toPixels(bytes: ArrayBuffer, from: Decodable): Promise<ImageData> {
	let pixels: ImageData | null;
	if (from === 'avif') {
		await readyAvifDecode();
		pixels = await decodeAvif(bytes);
	} else {
		await readyPngDecode();
		pixels = await decodePng(bytes);
	}
	// The decoders answer null rather than throwing on input they cannot read. Stored objects
	// were written by apps/cms and should always decode, so reaching this means the object is
	// damaged -- which the caller turns into a 502 rather than an empty image.
	if (!pixels) throw new Error(`could not decode the stored ${from}`);
	return pixels;
}

async function fromPixels(pixels: ImageData, to: Derivable): Promise<ArrayBuffer> {
	switch (to) {
		case 'webp':
			await readyWebpEncode();
			return encodeWebp(pixels, { quality: QUALITY });
		case 'jpeg':
			await readyJpegEncode();
			return encodeJpeg(pixels, { quality: QUALITY });
		case 'png':
			await readyPngEncode();
			return encodePng(pixels);
		case 'avif':
			await readyAvifEncode();
			// AVIF's scale is not the other two's: 50 is its own default and roughly where 80
			// lands for JPEG, so reusing `QUALITY` here would ask for a much larger file than
			// the fallbacks it sits beside.
			return encodeAvif(pixels, { quality: AVIF_QUALITY });
	}
}

/** Decode `bytes` and re-encode them as `to`. */
export async function transcode(
	bytes: ArrayBuffer,
	from: Decodable,
	to: Derivable,
): Promise<ArrayBuffer> {
	return fromPixels(await toPixels(bytes, from), to);
}

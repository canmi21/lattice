import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import encode, { init } from '@jsquash/webp/encode.js';
import { thumbHashToRGBA } from 'thumbhash';
import type { AssetManifest } from './assets.ts';

/**
 * The inline placeholders, all of them, encoded once at build time.
 *
 * Under `server/` because the codec arrives through `node:fs`, which no browser bundle may
 * contain. Every hash in the manifest is encoded in one pass rather than on demand, which is
 * what lets `resolve` in $lib/assets stay synchronous inside a markdown walk.
 *
 * The manifest carries only the thumbhash. The decoded copy this replaced was a 167-byte WebP
 * and deriving it here comes to 144 -- see spec/architecture/video/player.md for why WebP at all.
 */
/**
 * Quality for an image roughly 32 pixels on its long edge.
 *
 * Higher is wasted: the source is a thumbhash, which has already discarded everything but an
 * impression of colour and shape. This only has to avoid adding artefacts of its own to a
 * picture about to be covered by the real one.
 */
const QUALITY = 70;

/**
 * The encoder, instantiated once for the life of the process.
 *
 * A build calls this pass once and would not notice, but a dev server calls it again on every
 * content change -- and each call was compiling the codec's WebAssembly afresh and standing up
 * another instance with its own linear memory. Memoised the way the highlighter next door is:
 * both are one expensive object that every caller wants and nobody owns.
 */
let codec: Promise<void> | undefined;

function ready(): Promise<void> {
	codec ??= (async () => {
		const require = createRequire(import.meta.url);
		await init(
			await WebAssembly.compile(
				await readFile(require.resolve('@jsquash/webp/codec/enc/webp_enc.wasm')),
			),
		);
	})();
	return codec;
}

/**
 * What each thumbhash encodes to, kept across passes.
 *
 * A thumbhash is content-addressed and this derivation is pure, so an answer cannot go stale --
 * which makes the cache safe to keep and bounded by the number of distinct hashes that have ever
 * been seen. Without it a dev server re-encoded every picture in the manifest each time an
 * article changed, to arrive at the bytes it already had.
 */
const encoded = new Map<string, string>();

export async function buildPreviews(assets: AssetManifest): Promise<Map<string, string>> {
	await ready();

	const previews = new Map<string, string>();
	for (const asset of Object.values(assets.media)) {
		// Pictures only. A clip has no thumbhash of its own and needs none: what stands in for it
		// while the poster loads is the poster's, and a poster is an ordinary image asset with a
		// record of its own already in this loop. See spec/architecture/video/pipeline.md.
		if (asset.type !== 'image' || !asset.thumbhash || previews.has(asset.thumbhash)) continue;
		let preview = encoded.get(asset.thumbhash);
		if (preview === undefined) {
			const bytes = Uint8Array.from(atob(asset.thumbhash), (c) => c.charCodeAt(0));
			const { w, h, rgba } = thumbHashToRGBA(bytes);
			const webp = await encode(
				{ data: new Uint8ClampedArray(rgba), width: w, height: h, colorSpace: 'srgb' },
				{ quality: QUALITY },
			);
			preview = `data:image/webp;base64,${Buffer.from(webp).toString('base64')}`;
			encoded.set(asset.thumbhash, preview);
		}
		previews.set(asset.thumbhash, preview);
	}
	return previews;
}

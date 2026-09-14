import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { sourceFingerprint } from './assemble';
import {
	createAssetResolver,
	createDiagramResolver,
	createVideoResolver,
	EXTENSION,
	type AssetManifest,
	type MediaManifest,
} from './assets';

/**
 * The Rust function that names a published file, read out of its source.
 *
 * This table rebuilds a URL for a file `cms image` already named, so the two have to spell every
 * format the same way. Nothing connected them: both said `jpg` for a JPEG, and the CDN redirects
 * `.jpg` to `.jpeg` -- so agreeing was not enough, they had to agree on the spelling the CDN
 * serves directly. See spec/architecture/delivery.md.
 */
const ARM = /"(image\/[a-z+]+)" => (?:"([a-z0-9]+)"|(JPEG))/g;

it('names each format the way apps/cms names the file', () => {
	const source = readFileSync(
		fileURLToPath(new URL('../../../../../cms/src/extension.rs', import.meta.url)),
		'utf8',
	);
	const body = /pub fn for_variant\(mime: &str\) -> &'static str \{([\s\S]*?)\n\}/.exec(source);
	expect(body, 'for_variant moved or changed shape').not.toBeNull();

	// `JPEG` is a constant on the Rust side rather than a literal, so the spelling it holds is
	// resolved too -- the point of the constant is that both naming paths share one spelling.
	const jpeg = /const JPEG: &str = "([a-z]+)"/.exec(source)?.[1];
	const authoritative = Object.fromEntries(
		[...body![1]!.matchAll(ARM)].map((m) => [m[1], m[3] ? jpeg : m[2]]),
	);
	expect(Object.keys(authoritative).length).toBeGreaterThan(0);

	for (const [mime, extension] of Object.entries(authoritative)) {
		expect(EXTENSION[mime], `${mime} is spelled differently on each side`).toBe(extension);
	}
});

/**
 * The key both sides agree on, held to the Rust that writes it.
 *
 * The record's own key is a BLAKE3 content id this side cannot compute, so a diagram is found by
 * the cheap checksum the segment layout already uses -- over the block's whole source, which the
 * compiler reads back out of the article by the node's own position. If either side changed which
 * bytes it fingerprints, every description would go quietly missing and nothing else would break.
 */
it('finds a diagram by the checksum the CMS wrote, over the block source it fingerprints', () => {
	const payload = '```mermaid\ngraph TD\nA-->B\n```';
	const store = {
		diagrams: {
			'0123456789abcdef0123456789abcdef': {
				fingerprint: sourceFingerprint(new TextEncoder().encode(payload)),
				description: {
					'en-US': { text: 'A goes to B.' },
					'zh-CN': { text: 'A 指向 B。' },
				},
			},
		},
	};

	expect(createDiagramResolver(store, 'en-US')(payload)).toBe('A goes to B.');
	expect(createDiagramResolver(store, 'zh-CN')(payload)).toBe('A 指向 B。');
	// A locale nobody has translated into falls back to nothing rather than to English: the
	// caller's fallback is what the block said without a description at all.
	expect(createDiagramResolver(store, 'ko-KR')(payload)).toBeUndefined();
	// The payload alone is not the block. Getting this wrong is the failure this test exists for:
	// every description would go quietly missing and nothing else would break.
	expect(createDiagramResolver(store, 'en-US')('graph TD\nA-->B')).toBeUndefined();
	expect(createDiagramResolver({ diagrams: {} }, 'en-US')(payload)).toBeUndefined();
});

/**
 * A clip and the picture that posters it, as the manifest holds the pair.
 *
 * The rungs are written largest first on purpose: the order the markup needs is the resolver's
 * decision, not the record's, and a fixture that already agreed with it would prove nothing.
 */
const LIBRARY = {
	media: {
		poster: {
			type: 'image',
			thumbhash: 'AAAA',
			source: { width: 1920, height: 1080, ratio: '16:9' },
			variants: {
				small: { mime: 'image/avif', width: 640 },
				large: { mime: 'image/avif', width: 1920 },
			},
		},
		clip: {
			type: 'video',
			source: { width: 3840, height: 2160, ratio: '16:9' },
			poster: 'poster',
			variants: {
				tall: { mime: 'video/mp4', width: 3840, height: 2160, codec: 'av01.0.13M.08' },
				short: { mime: 'video/mp4', width: 1920, height: 1080, codec: 'av01.0.05M.08' },
			},
			captions: { spoken: { mime: 'text/vtt', language: 'en', kind: 'captions' } },
		},
		silent: {
			type: 'video',
			source: { width: 1280, height: 720, ratio: '16:9' },
			poster: 'poster',
			variants: { only: { mime: 'video/mp4', width: 854, height: 480, codec: 'av01.0.04M.08' } },
		},
	},
} satisfies AssetManifest;

const SAID = {
	media: {
		clip: {
			description: { 'en-US': { text: 'A hand turns the machine over.' } },
			source: { url: 'https://example.com/film', label: 'Example' },
		},
	},
} satisfies MediaManifest;

const PREVIEWS = new Map([['AAAA', 'data:image/webp;base64,PLACEHOLDER']]);

function videos(locale = 'en-US') {
	return createVideoResolver(LIBRARY, SAID, PREVIEWS, 'https://cdn.example', locale);
}

/**
 * The two things a `<source>` cannot work out for itself.
 *
 * It is selected by `type` alone, so a bare `video/mp4` would claim every browser can play an AV1
 * file and hand it to one that cannot -- the unsupported notice never fires, because nothing was
 * ever refused. And it is never selected by size, so the order the rungs come back in is the
 * pre-hydration answer: smallest first, which is the rung the article column was measured for.
 */
it('returns the rungs smallest first, each naming its codec', () => {
	const clip = videos()('clip.mp4');
	expect(clip?.rungs).toEqual([
		{
			src: 'https://cdn.example/video/short.mp4',
			type: 'video/mp4; codecs="av01.0.05M.08"',
			width: 1920,
			height: 1080,
		},
		{
			src: 'https://cdn.example/video/tall.mp4',
			type: 'video/mp4; codecs="av01.0.13M.08"',
			width: 3840,
			height: 2160,
		},
	]);
	// The original's dimensions, which is the box to reserve before anything is fetched.
	expect([clip?.width, clip?.height]).toEqual([3840, 2160]);
});

/**
 * A poster is an ordinary picture, and this is what saying so buys.
 *
 * It goes back through the image resolver rather than being addressed directly, so its rendition
 * and its placeholder are the ones every other reference to it would get. `poster` takes one URL
 * and has no `srcset`, so the largest is chosen here -- the only one that is never enlarged.
 */
it('resolves the poster through the picture it is', () => {
	const clip = videos()('clip.mp4');
	expect(clip?.poster).toBe('https://cdn.example/image/large.avif');
	expect(clip?.preview).toBe('data:image/webp;base64,PLACEHOLDER');
});

/** Flat URLs, and a track named by what the record says it is rather than by a label. */
it('addresses a text track by its own id, and a clip without one carries none', () => {
	expect(videos()('clip.mp4')?.captions).toEqual([
		{ src: 'https://cdn.example/captions/spoken.vtt', kind: 'captions', language: 'en' },
	]);
	expect(videos()('silent.mp4')?.captions).toEqual([]);
});

/**
 * What the notice reads from, and the language it reads in.
 *
 * The description is the clip's own, written from frames; the source is the claim somebody made
 * about where it came from, which lives in `media.yaml` because nothing can rebuild it.
 */
it('takes the description and the source from media.yaml, in the view being compiled', () => {
	expect(videos()('clip.mp4')?.description).toBe('A hand turns the machine over.');
	expect(videos()('clip.mp4')?.source).toEqual({
		url: 'https://example.com/film',
		label: 'Example',
	});
	// Nobody has translated it, so the view falls back to nothing rather than to English. The
	// caller's fallback is a video with no description, which is a state it already renders.
	expect(videos('ko-KR')('clip.mp4')?.description).toBeUndefined();
});

/**
 * `type` is the discriminant rather than a label, and this is the failure it prevents.
 *
 * A clip named where a picture belongs used to be a record with no `variants` worth reading; each
 * resolver now refuses the other's kind outright, and the caller falls back exactly as it does for
 * an id nobody has imported.
 */
it('refuses the other kind of record rather than half-reading it', () => {
	expect(videos()('poster.avif')).toBeNull();
	const pictures = createAssetResolver(LIBRARY, SAID, PREVIEWS, 'https://cdn.example');
	expect(pictures('clip.mp4')).toBeNull();
	expect(pictures('poster.avif')?.src).toBe('https://cdn.example/image/large.avif');
});

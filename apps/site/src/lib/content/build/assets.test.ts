import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { sourceFingerprint } from './assemble';
import {
	aspect,
	best,
	toned,
	width,
	ICON_EXTENSION,
	TONES,
	VARIANT_EXTENSION,
} from '@canmi/artifacts';
import {
	createAssetResolver,
	createDiagramResolver,
	createIconResolver,
	createVideoResolver,
	readAssets,
	type MediaManifest,
} from './assets';

/**
 * The Rust function that names a published file, read out of its source.
 *
 * The table is in libs/artifacts, beside `ICON_EXTENSION`; its test stays here because that
 * package's own program is the browser's and has no `node:fs` to read a file with. It rebuilds
 * a URL for a file `cms image` already named, and both sides once said `jpg` for a JPEG --
 * `/object` forms a key from the name and reads it, so that disagreement is a 404 now and this
 * is the only thing holding the two spellings together.
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
		expect(VARIANT_EXTENSION[mime], `${mime} is spelled differently on each side`).toBe(extension);
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
 * A clip, the picture that posters it, and the two ids each of them answers to.
 *
 * Two, because a record has two: the rid names the thing and an article spells it, and the cid
 * beneath names the bytes it was imported from, which is what `media.yaml` is still keyed by.
 * The rungs are written largest first on purpose -- the order the markup needs is the resolver's
 * decision, not the record's, and a fixture that already agreed with it would prove nothing.
 */
const COVER = 'k7m2x';
const CLIP = 'q3f8d';
const SILENT = 'w4n1c';
const IMPORTED = { cover: 'a'.repeat(32), clip: 'b'.repeat(32), silent: 'c'.repeat(32) };
const FILE = {
	small: '1'.repeat(32),
	large: '2'.repeat(32),
	tall: '3'.repeat(32),
	short: '4'.repeat(32),
	only: '5'.repeat(32),
	spoken: '6'.repeat(32),
};
const WHEN = '2026-09-14T02:55:32.15685Z';

function record(resource: string, type: string, layers: Record<string, unknown>) {
	return { version: 5, resource, type, created: WHEN, updated: WHEN, layers };
}

function imported(blake3: string, mime: string) {
	return { version: 1, origin: [{ blake3, mime, bytes: 1000 }] };
}

const LIBRARY = readAssets({
	version: 5,
	media: {
		[IMPORTED.cover]: record(COVER, 'media.image.frame', {
			media: imported(IMPORTED.cover, 'image/png'),
			image: {
				version: 1,
				thumbhash: 'AAAA',
				placeholder: 'data:image/webp;base64,PLACEHOLDER',
				dimension: { width: 1920, height: 1080, aspect: '16:9' },
				resolution: { width: 1920, height: 1080 },
				variants: [
					{
						content: FILE.large,
						mime: 'image/avif',
						bytes: 400,
						resolution: { width: 1920, height: 1080 },
					},
					{
						content: FILE.small,
						mime: 'image/avif',
						bytes: 100,
						resolution: { width: 640, height: 360 },
					},
				],
			},
			frame: { version: 1, source: CLIP },
		}),
		[IMPORTED.clip]: record(CLIP, 'media.video.clip', {
			media: imported(IMPORTED.clip, 'video/quicktime'),
			video: {
				version: 1,
				source: {
					mime: 'video/quicktime',
					width: 3840,
					height: 2160,
					aspect: '16:9',
					bytes: 5000,
					duration: 4,
					frame_rate: 30,
					frames: 120,
					audio: true,
				},
				cover: COVER,
				variants: [
					{
						content: FILE.tall,
						mime: 'video/mp4',
						bytes: 5000,
						resolution: { width: 3840, height: 2160 },
						codec: 'av01.0.13M.08',
					},
					{
						content: FILE.short,
						mime: 'video/mp4',
						bytes: 2000,
						resolution: { width: 1920, height: 1080 },
						codec: 'av01.0.05M.08',
					},
				],
				tracks: [
					{
						content: FILE.spoken,
						mime: 'text/vtt',
						language: 'en',
						kind: 'captions',
						bytes: 40,
					},
				],
			},
			clip: { version: 1 },
		}),
		[IMPORTED.silent]: record(SILENT, 'media.video.clip', {
			media: imported(IMPORTED.silent, 'video/quicktime'),
			video: {
				version: 1,
				source: {
					mime: 'video/quicktime',
					width: 1280,
					height: 720,
					aspect: '16:9',
					bytes: 900,
					duration: 2,
					frame_rate: 30,
					frames: 60,
					audio: false,
				},
				cover: COVER,
				variants: [
					{
						content: FILE.only,
						mime: 'video/mp4',
						bytes: 900,
						resolution: { width: 854, height: 480 },
						codec: 'av01.0.04M.08',
					},
				],
				tracks: [],
			},
			clip: { version: 1 },
		}),
	},
});

const SAID = {
	media: {
		[IMPORTED.clip]: {
			description: { 'en-US': { text: 'A hand turns the machine over.' } },
			source: { url: 'https://example.com/film', label: 'Example' },
		},
	},
} satisfies MediaManifest;

function videos(locale = 'en-US') {
	return createVideoResolver(LIBRARY, SAID, 'https://cdn.example', locale);
}

function pictures(locale = 'en-US') {
	return createAssetResolver(LIBRARY, SAID, 'https://cdn.example', locale);
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
	const clip = videos()(CLIP);
	expect(clip?.rungs).toEqual([
		{
			src: `https://cdn.example/object/${FILE.short}.mp4`,
			type: 'video/mp4; codecs="av01.0.05M.08"',
			width: 1920,
			height: 1080,
		},
		{
			src: `https://cdn.example/object/${FILE.tall}.mp4`,
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
 * `cover` is a rid, so it goes back through the image resolver as any other reference does and
 * its rendition and placeholder are the ones every reference to it would get. `poster` takes one
 * URL and has no `srcset`, so the file is chosen here -- the one that is never enlarged.
 */
it('resolves the poster through the picture it is', () => {
	const clip = videos()(CLIP);
	expect(clip?.poster).toBe(`https://cdn.example/object/${FILE.large}.avif`);
	expect(clip?.preview).toBe('data:image/webp;base64,PLACEHOLDER');
});

/** Flat URLs, and a track named by what the record says it is rather than by a label. */
it('addresses a text track by its own id, and a clip without one carries none', () => {
	expect(videos()(CLIP)?.captions).toEqual([
		{ src: `https://cdn.example/object/${FILE.spoken}.vtt`, kind: 'captions', language: 'en' },
	]);
	expect(videos()(SILENT)?.captions).toEqual([]);
});

/**
 * The intrinsic box and every rung under it, which is what the markup reserves space with.
 *
 * The widths come off each variant's own resolution and the box off the layer's `dimension`, and
 * they are different facts: the picture is what the page lays out for, the variants are what it
 * may be served as, and the largest of those is no more the box than the smallest is.
 */
it('names every rung by its width, under the box the picture itself declares', () => {
	const cover = pictures()(COVER);
	expect(cover).toMatchObject({
		src: `https://cdn.example/object/${FILE.large}.avif`,
		srcset: `https://cdn.example/object/${FILE.small}.avif 640w, https://cdn.example/object/${FILE.large}.avif 1920w`,
		width: 1920,
		height: 1080,
		ratio: '16:9',
	});
});

/**
 * Both ways an article spells a finished reference, because a corpus holds both.
 *
 * A rid is what it names after `cms migrate` and `{cid}.{ext}` is what it named before, and that
 * cid is an original's rather than the resource's. Reading only one of them would strand every
 * reference the other way round for as long as a migration round takes -- the same two forms
 * `apps/cms/src/refs.rs` answers on its side.
 */
it('answers a reference by the rid that names the thing, or the cid it was imported as', () => {
	expect(pictures()(COVER)?.src).toBe(`https://cdn.example/object/${FILE.large}.avif`);
	expect(pictures()(`${IMPORTED.cover}.avif`)?.src).toBe(
		`https://cdn.example/object/${FILE.large}.avif`,
	);
	// A file nobody has imported, which is what an article naming one gets until `cms image` runs.
	expect(pictures()('shot.png')).toBeNull();
});

/**
 * What the notice reads from, and the language it reads in.
 *
 * The description is the clip's own, written from frames; the source is the claim somebody made
 * about where it came from, which lives in `media.yaml` because nothing can rebuild it. Found
 * under the original's cid, which is how that file is keyed on both sides.
 */
it('takes the description and the source from media.yaml, in the view being compiled', () => {
	expect(videos()(CLIP)?.description).toBe('A hand turns the machine over.');
	expect(videos()(CLIP)?.source).toEqual({
		url: 'https://example.com/film',
		label: 'Example',
	});
	// Nobody has translated it, so the view falls back to nothing rather than to English. The
	// caller's fallback is a video with no description, which is a state it already renders.
	expect(videos('ko-KR')(CLIP)?.description).toBeUndefined();
});

/**
 * The chain is the discriminant rather than a label, and this is the failure it prevents.
 *
 * A clip named where a picture belongs used to be a record with no variants worth reading; each
 * resolver asks for the layer it needs and refuses the other's kind outright, so the caller falls
 * back exactly as it does for an id nobody has imported.
 */
it('refuses the other kind of record rather than half-reading it', () => {
	expect(videos()(COVER)).toBeNull();
	expect(pictures()(CLIP)).toBeNull();
});

/**
 * The manifest this site is actually built from, read by the schemas that will read it.
 *
 * The real file and never a fixture: what drifted apart was the shape this build declares and
 * the shape on disk, and a fixture asserting the two agree only checks itself. Both sides of the
 * migration are accepted and neither is a shrug -- before it the refusal has to name the command
 * to run, after it every record has to answer what the markup asks. `apps/cms/src/image/run.rs`
 * holds the same file to the loader on the other side.
 */
it('reads the committed manifest, whichever side of the migration it is on', () => {
	const file = fileURLToPath(
		new URL('../../../../../../data/record/metadata.json', import.meta.url),
	);
	const manifest = JSON.parse(readFileSync(file, 'utf8')) as { media: Record<string, object> };
	const records = Object.values(manifest.media);
	expect(records.length).toBeGreaterThan(0);

	// All or none. `cms migrate` writes the whole manifest before it rewrites anything else, so a
	// file holding both shapes is a run that died partway rather than a state to be tolerant of.
	const migrated = records.filter((record) => 'layers' in record);
	if (migrated.length === 0) {
		expect(() => readAssets(manifest)).toThrow('cms migrate');
		return;
	}
	expect(migrated).toHaveLength(records.length);

	const library = readAssets(manifest);
	const resolveIcon = createIconResolver(library);
	expect(library.byResource.size).toBe(records.length);
	for (const asset of library.byResource.values()) {
		const image = asset.layers.image;
		const icon = asset.layers.icon;
		// Every question the markup asks of a picture, asked of every picture in the corpus: a
		// file to serve, and a box to reserve before it arrives. **Which layer answers the first
		// of those is the record's to say**: an icon binds its files at `icon`, because what
		// selects between them is tone, so `image.variants` is empty and `best` has nothing to
		// pick from. See spec/architecture/resource.md, "Content binds at the layer that has it".
		if (image) {
			// **Optional means absent for an icon and for nothing else.** A picture written without
			// one renders with no placeholder, silently losing the paint-before-load a thumbhash
			// exists for -- which no type and no build would fail on.
			expect(Boolean(image.thumbhash), `${asset.resource} (${asset.type})`).toBe(!icon);
			// And the decoded copy beside it, which is the form the page actually paints. The
			// hash alone was enough while a build inlined it; a universal load cannot run the
			// codec, so a record carrying only the hash is a picture nothing paints under. See
			// spec/architecture/resource.md, "A rid is resolved three times".
			expect(Boolean(image.placeholder), `${asset.resource} (${asset.type})`).toBe(!icon);
			const serves = icon
				? (toned(icon, 'light') ?? toned(icon, 'dark'))
				: best(image, width(image));
			expect(serves, `${asset.resource} has nothing to serve`).toBeDefined();
			expect(aspect(image), `${asset.resource} has no aspect`).toMatch(/^\d+:\d+$/);
		}
		// An icon is the one leaf whose content is keyed by name. Both tones point at objects the
		// CDN can be asked for, under a spelling this side and apps/cms agree on, and the domain
		// it belongs to is what a link card's URL is turned into a rid through.
		if (icon) {
			expect(resolveIcon(`https://${icon.domain}/deep/page`), icon.domain).toBe(asset.resource);
			expect(image?.variants, `${asset.resource} binds at icon and not at image`).toEqual([]);
			for (const tone of TONES) {
				const file = icon.tones[tone];
				if (file) expect(ICON_EXTENSION[file.mime], `${asset.resource} ${tone}`).toBeDefined();
			}
		}
		// A cover is a rid, and the picture it names is in this same file. A cover that resolved
		// to nothing would be a clip rendering with no poster and nothing reported.
		const cover = asset.layers.video?.cover;
		if (cover) expect(library.byResource.get(cover)?.layers.image, cover).toBeDefined();
	}
});

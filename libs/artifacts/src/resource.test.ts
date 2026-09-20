import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	best,
	CANONICAL_PATTERN,
	enough,
	expandCanonical,
	ICON_EXTENSION,
	parseResource,
	namedResources,
	pictured,
	requireSegment,
	resolution,
	resourceQuestions,
	RESOURCES_PER_QUESTION,
	ResourcesRequestSchema,
	scalable,
	toned,
} from './index';

const base = {
	version: 5,
	resource: 'k7m2x',
	created: '2026-01-01T00:00:00Z',
	updated: '2026-01-01T00:00:00Z',
};
const media = { version: 1, origin: [{ blake3: 'a'.repeat(32), mime: 'image/png', bytes: 1 }] };
const image = {
	version: 1,
	thumbhash: 'AQ==',
	dimension: { width: 10, height: 10, aspect: '1:1' },
	resolution: { width: 10, height: 10 },
	variants: [],
};

/**
 * The five rows of spec/architecture/resource.md, "Parsing is optimistic, not compatible".
 *
 * Four of them are survivable and the fifth is not, and the difference is the whole rule: not
 * knowing about something is tolerable, being handed the wrong kind of thing is not.
 */
describe('the optimistic table', () => {
	it('ignores a field it does not know', () => {
		const r = parseResource({
			...base,
			type: 'media.image',
			extra: 'nope',
			layers: { media, image: { ...image, wat: 1 } },
		});
		expect(r.segments).toEqual(['media', 'image']);
	});
	it('stops at a type segment it does not know', () => {
		const r = parseResource({
			...base,
			type: 'media.image.unheardof',
			layers: { media, image, unheardof: { version: 1 } },
		});
		expect(r.segments).toEqual(['media', 'image']);
	});
	it('stops at a layer version above what it knows', () => {
		const r = parseResource({
			...base,
			type: 'media.image',
			layers: { media, image: { ...image, version: 99 } },
		});
		expect(r.segments).toEqual(['media']);
	});
	it('errors on a layer no type segment declares', () => {
		expect(() => parseResource({ ...base, type: 'media', layers: { media, image } })).toThrow();
	});
	it('errors when a needed segment is absent', () => {
		const r = parseResource({
			...base,
			type: 'document',
			layers: { document: { version: 1, slug: 's', source: 'b'.repeat(32), locales: {} } },
		});
		expect(() => requireSegment(r, 'image')).toThrow();
	});
});

/**
 * The account `apps/cms/src/image/exif.rs` flattens into a photograph and a screenshot alike.
 *
 * A layer with no home for a field strips it rather than refusing it, so the two sides drifting
 * apart here costs data on the way past and reports nothing. Ten records carry these.
 */
describe('the exif account', () => {
	it('keeps what a screenshot carries beside its scale', () => {
		const r = parseResource({
			...base,
			type: 'media.image.screenshot',
			layers: {
				media,
				image,
				screenshot: {
					version: 1,
					scale: 2,
					color_space: 'sRGB',
					software: 'macOS 26.0',
					orientation: 1,
				},
			},
		});
		expect(requireSegment(r, 'screenshot')).toMatchObject({
			scale: 2,
			color_space: 'sRGB',
			software: 'macOS 26.0',
			orientation: 1,
		});
	});

	it('keeps half a position rather than failing the record over the other half', () => {
		// A file can carry a latitude and no longitude. Requiring the pair would refuse the whole
		// record over a point nobody was going to plot.
		const r = parseResource({
			...base,
			type: 'media.image.photo',
			layers: { media, image, photo: { version: 1, location: { latitude: 35.6 } } },
		});
		expect(requireSegment(r, 'photo').location).toEqual({ latitude: 35.6 });
	});
});

/**
 * The ladder in spec/architecture/resource.md, "The image layer answers in four steps".
 *
 * Step two is the one worth holding: a caller asking whether a picture will do must get an
 * answer without knowing which formats scale, or that line grows a copy in every caller.
 */
describe('the image ladder', () => {
	const raster = {
		version: 1,
		thumbhash: 'AQ==',
		dimension: { width: 1920, height: 1080, aspect: '16:9' },
		resolution: { width: 1920, height: 1080 },
		variants: [
			{
				content: 'a'.repeat(32),
				mime: 'image/avif',
				bytes: 10,
				resolution: { width: 640, height: 360 },
			},
			{
				content: 'b'.repeat(32),
				mime: 'image/avif',
				bytes: 20,
				resolution: { width: 1920, height: 1080 },
			},
		],
	};
	// No `resolution`, which is how a vector says so -- there is no second field to consult.
	const vector = {
		version: 1,
		thumbhash: 'AQ==',
		dimension: { width: 512, height: 512, aspect: '1:1' },
		variants: [{ content: 'c'.repeat(32), mime: 'image/svg+xml', bytes: 30 }],
	};

	it('answers pixels for a bitmap and nothing for a vector', () => {
		expect(resolution(raster)).toEqual({ width: 1920, height: 1080 });
		expect(resolution(vector)).toBeNull();
		expect(scalable(vector)).toBe(true);
		expect(scalable(raster)).toBe(false);
	});

	it('says a vector is always enough without comparing anything', () => {
		expect(enough(vector, 4000)).toBe(true);
		expect(enough(raster, 4000)).toBe(false);
		expect(enough(raster, 1000)).toBe(true);
	});

	it('picks a file that covers the target', () => {
		expect(best(raster, 500)?.content).toBe('a'.repeat(32));
		expect(best(raster, 1500)?.content).toBe('b'.repeat(32));
		expect(best(vector, 9999)?.content).toBe('c'.repeat(32));
	});
});

/**
 * A canonical is a scheme and not an address, so that moving a domain touches one declaration
 * rather than every record. These assert the expansion and, more importantly, the refusal: a
 * value that is already a URL must not resolve, or the first one somebody writes will work and
 * the property will be gone without a failure to notice it by.
 */
describe('what a bare resource id means', () => {
	const hosts = { cdn: 'https://cdn.example', site: 'https://site.example' };

	it('expands an object scheme against the CDN', () => {
		expect(expandCanonical(`cid:${'a'.repeat(32)}.avif`, hosts)).toBe(
			`https://cdn.example/object/${'a'.repeat(32)}.avif`,
		);
	});

	it('expands a slug against the site, with no lookup', () => {
		// The site resolves a bare name to the article's real path itself, so nothing here has to
		// know where the article lives -- which is why a slug survives an article being moved.
		expect(expandCanonical('slug:less-is-more', hosts)).toBe('https://site.example/less-is-more');
	});

	it('refuses anything carrying a host of its own', () => {
		expect(expandCanonical('https://site.example/less-is-more', hosts)).toBeUndefined();
		expect(CANONICAL_PATTERN.test('https://site.example/x')).toBe(false);
	});
});

/**
 * The icon layer, which is where a leaf type's own axis lives.
 *
 * Tone is not a size, so it is not a variant; a site with one mark carries one key rather than a
 * null. See spec/architecture/resource.md, "Content binds at the layer that has it".
 */
describe('an icon binds its files by tone', () => {
	const file = (content: string) => ({
		content: content.repeat(32),
		mime: 'image/svg+xml',
		bytes: 1,
	});
	const iconOf = (tones: Record<string, unknown>) =>
		parseResource({
			...base,
			type: 'media.image.icon',
			layers: {
				media,
				image: { version: 1, dimension: { width: 32, height: 32, aspect: '1:1' }, variants: [] },
				icon: { version: 1, domain: 'a.example', tones },
			},
		});

	it('reads a record that names one tone and no null', () => {
		const parsed = iconOf({ dark: file('d') });
		const icon = requireSegment(parsed, 'icon');
		expect(icon.tones.light).toBeUndefined();
		// A named tone is that tone or nothing; with none named the one file answers.
		expect(toned(icon, 'light')).toBeUndefined();
		expect(toned(icon, 'dark')?.content).toBe('d'.repeat(32));
		expect(toned(icon)?.content).toBe('d'.repeat(32));
	});

	it('prefers light when no tone is named, an untinted mark being drawn for light', () => {
		const icon = requireSegment(iconOf({ light: file('a'), dark: file('b') }), 'icon');
		expect(toned(icon)?.content).toBe('a'.repeat(32));
	});

	it('refuses an icon that names no file at all', () => {
		// A resource that is an icon and holds nothing could only be answered with a blank, which
		// is how a missing mark becomes a missing mark nobody reports.
		expect(() => iconOf({})).toThrow();
	});

	it('carries no placeholder, two tones being two pictures', () => {
		const parsed = iconOf({ light: file('a') });
		expect(requireSegment(parsed, 'image').thumbhash).toBeUndefined();
		expect(ICON_EXTENSION['image/svg+xml']).toBe('svg');
	});
});

/**
 * The two selectors, and the one way they differ.
 *
 * A mark that does not resolve is absent and a picture that does not is an error. Both sides of
 * that are asserted here, because a change making the second one quiet would look like an
 * improvement and would be the failure spec/architecture/resource.md names: a missing image
 * nobody reports.
 */
describe('the picture selector', () => {
	const variants = [
		{ content: 'a'.repeat(32), mime: 'image/avif', bytes: 9, resolution: { width: 640, height: 640 } },
		{ content: 'b'.repeat(32), mime: 'image/avif', bytes: 99, resolution: { width: 10, height: 10 } },
	];
	const drawn = {
		...image,
		placeholder: 'data:image/webp;base64,PLACEHOLDER',
		variants,
	};
	const picture = parseResource({ ...base, type: 'media.image', layers: { media, image: drawn } });

	it('builds the ladder smallest first, and the src from the rung that is never enlarged', () => {
		const answer = pictured('k7m2x', picture, 'https://cdn.example');
		expect(answer.srcset).toBe(
			`https://cdn.example/object/${'b'.repeat(32)}.avif 10w, https://cdn.example/object/${'a'.repeat(32)}.avif 640w`,
		);
		// The intrinsic box and not the chosen file's, which is what reserves the right space.
		expect([answer.width, answer.height, answer.ratio]).toEqual([10, 10, '1:1']);
		expect(answer.placeholder).toBe('data:image/webp;base64,PLACEHOLDER');
	});

	it('refuses a rid the corpus answered nothing for', () => {
		expect(() => pictured('k7m2x', undefined, 'https://cdn.example')).toThrow('k7m2x');
	});

	it('refuses a resource that is not a picture', () => {
		const document = parseResource({
			...base,
			type: 'document',
			layers: { document: { version: 1, slug: 's', source: 'b'.repeat(32), locales: {} } },
		});
		expect(() => pictured('k7m2x', document, 'https://cdn.example')).toThrow();
	});

	it('refuses a picture nothing has been derived for', () => {
		const bare = parseResource({ ...base, type: 'media.image', layers: { media, image } });
		expect(() => pictured('k7m2x', bare, 'https://cdn.example')).toThrow('k7m2x');
	});
});

/**
 * What a page asks for, read off the blocks by one name rather than by a list of block types.
 *
 * The list it replaces grew an arm per block, in the page that renders them. This asserts the
 * property that replaced it: a block carrying no resources costs nothing, and one carrying two
 * needs no arm of its own.
 */
describe('the resources a view names', () => {
	it('reads every role on every block, once each, and nothing else', () => {
		expect(
			namedResources([
				{ type: 'prose', html: '<p>a</p>' },
				{ type: 'image', resources: { picture: 'k7m2x' }, alt: 'A' },
				{ type: 'image', resources: { picture: 'k7m2x' }, alt: 'Again' },
				{ type: 'linkcard', src: 'a', url: 'https://example.com', title: 'T' },
				{
					type: 'linkcard',
					src: 'b',
					url: 'https://example.com',
					title: 'T',
					resources: { icon: 'q4w8n' },
				},
			]),
		).toEqual(['k7m2x', 'q4w8n']);
	});
});

/**
 * What those rids become on the wire, which is one question for every page this corpus has.
 *
 * The cap is a limit of the request and not of the page, and the difference only shows past it:
 * read the other way a page over the cap is refused, and a refusal here is a blank article rather
 * than a missing picture, because `pictured` throws for a rid it has no record of.
 */
describe('the questions one page becomes', () => {
	it('asks once for a page, and deduplicates a list assembled from more than one view', () => {
		expect(resourceQuestions(['k7m2x', 'q4w8n', 'k7m2x'])).toEqual([['k7m2x', 'q4w8n']]);
		expect(resourceQuestions([])).toEqual([]);
	});

	it('splits at what one request carries rather than handing over a body that is refused', () => {
		const many = Array.from({ length: RESOURCES_PER_QUESTION + 1 }, (_, at) => `r${at}`);
		const questions = resourceQuestions(many);
		expect(questions.map((question) => question.length)).toEqual([RESOURCES_PER_QUESTION, 1]);
		// Every rid asked for, exactly once, whichever question it landed in.
		expect(questions.flat()).toEqual(many);
		// And each question is one the schema will read, which is the whole point of the split.
		for (const rids of questions) {
			expect(v.is(ResourcesRequestSchema, { type: 'resources', rids })).toBe(true);
		}
		expect(v.is(ResourcesRequestSchema, { type: 'resources', rids: many })).toBe(false);
	});
});

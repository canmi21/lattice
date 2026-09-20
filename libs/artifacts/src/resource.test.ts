import { describe, expect, it } from 'vitest';
import {
	best,
	CANONICAL_PATTERN,
	enough,
	expandCanonical,
	ICON_EXTENSION,
	parseResource,
	requireSegment,
	resolution,
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

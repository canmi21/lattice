import { describe, expect, it } from 'vitest';
import { best, enough, parseResource, requireSegment, resolution, scalable } from './index';

const base = {
	version: 5, resource: 'k7m2x', created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
};
const media = { version: 1, origin: [{ blake3: 'a'.repeat(32), mime: 'image/png', bytes: 1 }] };
const image = {
	version: 1, dimension: { width: 10, height: 10, aspect: '1:1' },
	resolution: { width: 10, height: 10 }, variants: [],
};

/**
 * The five rows of spec/architecture/resource.md, "Parsing is optimistic, not compatible".
 *
 * Four of them are survivable and the fifth is not, and the difference is the whole rule: not
 * knowing about something is tolerable, being handed the wrong kind of thing is not.
 */
describe('the optimistic table', () => {
	it('ignores a field it does not know', () => {
		const r = parseResource({ ...base, type: 'media.image', extra: 'nope',
			layers: { media, image: { ...image, wat: 1 } } });
		expect(r.segments).toEqual(['media', 'image']);
	});
	it('stops at a type segment it does not know', () => {
		const r = parseResource({ ...base, type: 'media.image.unheardof',
			layers: { media, image, unheardof: { version: 1 } } });
		expect(r.segments).toEqual(['media', 'image']);
	});
	it('stops at a layer version above what it knows', () => {
		const r = parseResource({ ...base, type: 'media.image',
			layers: { media, image: { ...image, version: 99 } } });
		expect(r.segments).toEqual(['media']);
	});
	it('errors on a layer no type segment declares', () => {
		expect(() => parseResource({ ...base, type: 'media',
			layers: { media, image } })).toThrow();
	});
	it('errors when a needed segment is absent', () => {
		const r = parseResource({ ...base, type: 'document', layers: { document: { version: 1,
			slug: 's', source: 'b'.repeat(32), locales: {} } } });
		expect(() => requireSegment(r, 'image')).toThrow();
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
		version: 1, dimension: { width: 1920, height: 1080, aspect: '16:9' },
		resolution: { width: 1920, height: 1080 },
		variants: [
			{ content: 'a'.repeat(32), mime: 'image/avif', bytes: 10, resolution: { width: 640, height: 360 } },
			{ content: 'b'.repeat(32), mime: 'image/avif', bytes: 20, resolution: { width: 1920, height: 1080 } },
		],
	};
	// No `resolution`, which is how a vector says so -- there is no second field to consult.
	const vector = {
		version: 1, dimension: { width: 512, height: 512, aspect: '1:1' },
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

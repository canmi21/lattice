import { describe, expect, it } from 'vitest';
import { fill, placeholders, read, ROUTES, SHAPES } from './routes';

describe("a route's shape", () => {
	it('names the thing in the path and leaves the rest for the query', () => {
		expect(fill('articles/{slug}', { slug: 'a-b', locale: 'ja' })).toEqual({
			path: 'articles/a-b',
			query: { locale: 'ja' },
		});
		expect(fill('assets/{name*}', { name: 'aka/favicon.ico' })?.path).toBe('assets/aka/favicon.ico');
		expect(fill('articles/{slug}', {})).toBeUndefined();
	});

	it('reads back what it filled, and nothing that is not its shape', () => {
		for (const route of ROUTES) {
			const parameters = Object.fromEntries(
				placeholders(SHAPES[route]).map(({ name, rest }) => [name, rest ? 'a/b c' : 'a b']),
			);
			const filled = fill(SHAPES[route], parameters);
			expect(read(SHAPES[route], filled?.path ?? ''), route).toEqual(parameters);
		}
		expect(read('articles/{slug}', 'articles/a/reads')).toBeUndefined();
		expect(read('articles/{slug}/reads', 'articles/a')).toBeUndefined();
		expect(read('media/{resource}', 'media/')).toBeUndefined();
	});

	it('gives every route a shape of its own', () => {
		const shapes = ROUTES.map((route) => SHAPES[route]);
		expect(new Set(shapes).size).toBe(shapes.length);
	});
});

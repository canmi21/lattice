import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { RootViewSchema } from './index';

/** One locale's row of the root, as `apps/site/scripts/publish.ts` writes it. */
const view = {
	objects: { content: 'a'.repeat(32) },
	locale: {
		language_tag: 'en',
		canonical: 'https://site.example/less-is-more',
		translated: true,
	},
	meta: {
		title: 'Less is more',
		subtitle: 'On saying one thing',
		description: 'An article.',
		short: { title: 'Less is more', subtitle: 'One thing' },
	},
	dates: {
		created: '2026-08-22T22:17:34Z',
		published: '2026-08-23T09:00:00Z',
		lastmod: '2026-09-01T12:30:00Z',
	},
	metrics: { words: 900 },
	preview: { paragraphs: ['The first paragraph.'] },
};

/**
 * The three dates a view carries, and the reason the set is pinned rather than sampled.
 *
 * `dates` is a `v.object`, so a key it does not declare is dropped on the way past instead of
 * being refused. The publisher writing a date this schema has not been told about is therefore
 * not a failure anywhere: it is written into the bucket, parsed away where the root is read, and
 * every consumer renders `undefined`. These assert the parsed record and never the input, since
 * a test that only checks nothing threw would have passed before the field existed.
 */
describe('the dates a view carries', () => {
	it('parses a view that says when the article went public', () => {
		expect(v.parse(RootViewSchema, view).dates).toEqual({
			created: '2026-08-22T22:17:34Z',
			published: '2026-08-23T09:00:00Z',
			lastmod: '2026-09-01T12:30:00Z',
		});
	});

	it('refuses a view that says when it was written but not when it went public', () => {
		const dates = { created: view.dates.created, lastmod: view.dates.lastmod };
		expect(() => v.parse(RootViewSchema, { ...view, dates })).toThrow();
	});

	it('drops a date it has not been told about rather than reporting one', () => {
		// Not the behaviour being asked for -- the behaviour being guarded against. A fourth date
		// added to the publisher and not to the schema disappears exactly like this.
		const dates = { ...view.dates, retracted: '2026-09-02T00:00:00Z' };
		expect(v.parse(RootViewSchema, { ...view, dates }).dates).not.toHaveProperty('retracted');
	});

	it('declares these three dates and no others', () => {
		// The pin the comment above asks for: the schema's own key set, read off the schema, so
		// that adding a date to the publisher without adding it here cannot pass unnoticed.
		expect(Object.keys(RootViewSchema.entries.dates.entries)).toEqual([
			'created',
			'published',
			'lastmod',
		]);
	});
});

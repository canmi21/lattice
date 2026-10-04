import { expect, it } from 'vitest';
import { buildLlms, buildLlmsFull, type LlmsInput } from './llms';

const INPUT: LlmsInput = {
	articles: [
		{
			slug: 'a',
			path: 'architecture/a',
			url: 'x:architecture/a',
			meta: {
				title: 'A',
				subtitle: 'The\nfirst.',
				description: '',
				short: { title: 'A', subtitle: '' },
			},
			dates: { created: '2026-01-01', published: '2026-01-02T00:00:00Z', lastmod: '2026-01-03' },
			metrics: { words: 12345 },
			objects: { content: 'c' },
			preview: { paragraphs: [] },
		},
	] as unknown as LlmsInput['articles'],
	languages: { a: 'zh' },
	site: { name: 'Site', tagline: 'Notes.' },
	author: { name: 'Canmi' },
	profiles: ['x:profile'.replace('x:', 'https://example.com/')],
	group: 'https://example.com/group',
	generated: '2026-09-21T19:32:18.516Z',
	now: new Date('2026-10-01T00:00:00Z'),
};

it('opens as llmstxt.org sets out: the name, the one description, then how to read the site', () => {
	const lines = buildLlms(INPUT).split('\n');
	expect(lines[0]).toBe('# Site');
	expect(lines[2]).toBe('> Notes. The site of Canmi.');
	expect(lines[4]).toBe(
		'Generated 2026-10-01T00:00:00Z, from the corpus published 2026-09-21T19:32:18Z.',
	);
});

it('lists each article with the facts that rank it, and keeps the skippable ones last', () => {
	const text = buildLlms(INPUT);
	expect(text).toContain(
		'- [A](x:architecture/a.md): In architecture, published 2026-01-02, in Chinese (zh), 12,345 words. The first.',
	);
	expect(text).toContain(
		"- [Canmi's Telegram group](https://example.com/group): A group the author runs.",
	);
	expect(text.indexOf('## Articles')).toBeLessThan(text.indexOf('## Site'));
	expect(text.indexOf('## Site')).toBeLessThan(text.indexOf('## Optional'));
});

it('puts every view after the same opening in the full text', () => {
	const full = buildLlmsFull(INPUT, ['# A\n\nBody.']);
	expect(full.startsWith('# Site\n')).toBe(true);
	expect(full).toContain('---\n\n# A\n\nBody.');
});

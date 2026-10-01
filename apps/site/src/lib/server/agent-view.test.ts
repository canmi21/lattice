import { describe, expect, it } from 'vitest';
import { bodyOf, contents, fields, opening, stamp, table } from './agent-view';

const COMPILED = `---
title: A title
lang: zh
---

# A title

The description.

## A part

\`\`\`md
## not a heading
\`\`\`

Text | with a pipe.
`;

describe('the body', () => {
	it('drops the front matter, the title and the repeated description, and nests every heading', () => {
		const body = bodyOf(COMPILED, 'The description.');
		expect(body.startsWith('### A part')).toBe(true);
		expect(body).toContain('## not a heading');
		expect(body).not.toContain('The description.');
	});
});

describe('the tables', () => {
	it('keeps a value to one line and escapes its pipes, and leaves out what has none', () => {
		expect(fields([['A', 'x | y\nz'], ['B', undefined]])).toBe(
			'| Field | Value |\n| --- | --- |\n| A | x \\| y z |',
		);
		expect(table(['H'], [['v']])).toBe('| H |\n| --- |\n| v |');
	});
});

it('opens with what the view is, when it was made, and where the page for humans is', () => {
	const head = opening('T', 'x:page', new Date('2026-10-01T08:00:00.123Z'), '> Notice.');
	expect(head).toContain('agent view of x:page, generated 2026-10-01T08:00:00Z');
	expect(head).toContain('The same page for humans is the address without `.md`.');
	expect(head).toContain('Every page on this site has its agent view at its own address with `.md` appended');
	expect(stamp('2026-09-21T19:32:18.516Z')).toBe('2026-09-21T19:32:18Z');
});

it('lists the contents nested from the shallowest heading, each linking into the page', () => {
	const list = contents(
		[
			{ slug: 'a', text: 'A', depth: 2 },
			{ slug: 'b', text: 'B', depth: 3 },
		],
		'x:page',
	);
	expect(list).toBe('- [A](x:page#a)\n  - [B](x:page#b)');
});

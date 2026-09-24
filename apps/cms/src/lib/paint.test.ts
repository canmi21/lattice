/**
 * The drawing of a text: what is wrapped, what is hidden, and when it shows. See paint.ts.
 */
import { syntaxTree } from '@canmi/compile/parser';
import { describe, expect, it } from 'vitest';
import { paint, type Paint, type Selected } from './paint.ts';

const CLASSES = {
	heading: (depth: number) => `h${depth}`,
	link: 'link',
	gap: (pixels: number) => `gap${pixels}`,
	blank: 'blank',
	quote: { line: 'q', first: 'q-first', last: 'q-last' },
	rule: 'rule',
};

function draw(text: string, selected: Selected = []) {
	return paint(text, syntaxTree(text), selected, CLASSES);
}

/** The text each paint covers, which is easier to read than offsets. */
function read(text: string, paints: Paint[]) {
	return paints.map((p) =>
		p.kind === 'mark'
			? `${p.tag}:${text.slice(p.from, p.to)}`
			: p.kind === 'hide'
				? `hide:${text.slice(p.from, p.to)}`
				: p.kind === 'line'
					? `line:${p.class}@${p.at}`
					: p.kind === 'rule'
						? `rule:${text.slice(p.from, p.to)}`
						: `soft@${p.at}`,
	);
}

const caret = (at: number): Selected => [{ from: at, to: at }];

describe('paint', () => {
	it('draws bold words in strong and hides their asterisks', () => {
		const text = 'a **bold** b';
		expect(read(text, draw(text))).toEqual(['strong:bold', 'hide:**', 'hide:**']);
	});

	it('shows the asterisks while the caret touches the run, edges included', () => {
		const text = 'a **bold** b';
		expect(read(text, draw(text, caret(6)))).toEqual(['strong:bold']);
		expect(read(text, draw(text, caret(10)))).toEqual(['strong:bold']);
		expect(read(text, draw(text, caret(11)))).toEqual(['strong:bold', 'hide:**', 'hide:**']);
	});

	it('draws nested marks each in its own element', () => {
		const text = '**b *c* d**';
		expect(read(text, draw(text))).toEqual([
			'strong:b *c* d',
			'hide:**',
			'hide:**',
			'em:c',
			'hide:*',
			'hide:*',
		]);
	});

	it('draws code, strike and links', () => {
		const text = '`x` ~~y~~ [z](https://example.com)';
		expect(read(text, draw(text))).toEqual([
			'code:x',
			'hide:`',
			'hide:`',
			'del:y',
			'hide:~~',
			'hide:~~',
			'a:z',
			'hide:[',
			'hide:](https://example.com)',
		]);
	});

	it('sets a heading in its type and hides its marker unless the caret is on it', () => {
		const text = 'p\n\n## Title';
		expect(read(text, draw(text))).toEqual([
			'line:h2@3',
			'hide:## ',
			'line:blank@2',
			'line:gap32@3',
		]);
		expect(read(text, draw(text, caret(8)))).toEqual(['line:h2@3', 'line:blank@2', 'line:gap32@3']);
	});

	it('hides the backslash of a break, and marks a soft break where the page joins lines', () => {
		const text = 'one\\\ntwo\nthree';
		expect(read(text, draw(text))).toEqual(['soft@8', 'hide:\\']);
	});

	it('leaves broken syntax as the text it is', () => {
		const text = 'a **open';
		expect(read(text, draw(text))).toEqual([]);
	});

	it("spaces blocks as the page does: a blank line is a paragraph's gap, more goes above", () => {
		const text = 'a\n\nb\n\n### c\n\n---\n\nd';
		expect(read(text, draw(text)).filter((p) => p.startsWith('line:'))).toEqual([
			'line:h3@6',
			'line:rule@13',
			'line:blank@2',
			'line:blank@5',
			'line:gap16@6',
			'line:blank@12',
			'line:gap24@13',
			'line:blank@17',
			'line:gap24@18',
		]);
	});

	it('puts a quote on its ground and hides its markers unless the caret is in it', () => {
		const text = '> one\n> two';
		expect(read(text, draw(text))).toEqual([
			'line:q q-first@0',
			'hide:> ',
			'line:q q-last@6',
			'hide:> ',
			// One paragraph across two quoted lines: the page joins them.
			'soft@5',
		]);
		expect(read(text, draw(text, caret(3)))).toEqual([
			'line:q q-first@0',
			'line:q q-last@6',
			'soft@5',
		]);
	});

	it('draws a rule over its dashes unless the caret is on them', () => {
		const text = 'a\n\n---';
		expect(read(text, draw(text))).toContain('rule:---');
		expect(read(text, draw(text, caret(5)))).not.toContain('rule:---');
	});
});

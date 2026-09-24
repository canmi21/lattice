/**
 * The drawing of a text: what is wrapped, what is hidden, and when it shows. See paint.ts.
 */
import { syntaxTree } from '@canmi/compile/parser';
import { describe, expect, it } from 'vitest';
import { paint, type Paint, type Selected } from './paint.ts';

const CLASSES = { heading: (depth: number) => `h${depth}`, link: 'link' };

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
		expect(read(text, draw(text))).toEqual(['line:h2@3', 'hide:## ']);
		expect(read(text, draw(text, caret(8)))).toEqual(['line:h2@3']);
	});

	it('hides the backslash of a break, and marks a soft break where the page joins lines', () => {
		const text = 'one\\\ntwo\nthree';
		expect(read(text, draw(text))).toEqual(['soft@8', 'hide:\\']);
	});

	it('leaves broken syntax as the text it is', () => {
		const text = 'a **open';
		expect(read(text, draw(text))).toEqual([]);
	});
});

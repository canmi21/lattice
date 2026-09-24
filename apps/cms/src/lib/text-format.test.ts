/**
 * Setting and taking off a mark over a selection. See text-format.ts.
 */
import { syntaxTree } from '@canmi/compile/parser';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { type Mark, marksAt, toggle } from './text-format.ts';

/** The text after toggling `type` over `[` `]`, with the selection marked the same way. */
function press(marked: string, type: Mark): string {
	const from = marked.indexOf('[');
	const to = marked.indexOf(']') - 1;
	const text = marked.slice(0, from) + marked.slice(from + 1, to + 1) + marked.slice(to + 2);
	let state = EditorState.create({ doc: text, selection: EditorSelection.range(from, to) });
	const spec = toggle(state, syntaxTree(text), type);
	if (spec) state = state.update(spec).state;
	const { from: start, to: end } = state.selection.main;
	const doc = state.doc.toString();
	return `${doc.slice(0, start)}[${doc.slice(start, end)}]${doc.slice(end)}`;
}

describe('toggling a mark', () => {
	it('wraps plain words, and keeps them selected', () => {
		expect(press('a [word] b', 'strong')).toBe('a **[word]** b');
		expect(press('a [word] b', 'inlineCode')).toBe('a `[word]` b');
	});

	it('takes the mark off words already inside it', () => {
		expect(press('a **[word]** b', 'strong')).toBe('a [word] b');
		expect(press('a **so [much] more** b', 'strong')).toBe('a so [much] more b');
	});

	it('leaves other marks alone', () => {
		expect(press('a ***[word]*** b', 'emphasis')).toBe('a **[word]** b');
	});

	it('wraps each line of a selection across lines', () => {
		expect(press('[one\n\ntwo]', 'delete')).toBe('~~[one~~\n\n~~two]~~');
	});

	it('names the marks a selection is inside', () => {
		const text = 'a ***word*** b';
		const state = EditorState.create({ doc: text, selection: EditorSelection.range(5, 9) });
		expect(marksAt(state, syntaxTree(text)).toSorted()).toEqual(['emphasis', 'strong']);
	});
});

/**
 * Typing a syntax character over a selection wraps it. See text-wrap.ts.
 */
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { wrapping } from './text-wrap.ts';

/** The text after typing `typed` over `from..to`, with the selection marked by `[` and `]`. */
function type(text: string, from: number, to: number, ...typed: string[]): string {
	let state = EditorState.create({ doc: text, selection: EditorSelection.range(from, to) });
	for (const character of typed) {
		const spec = wrapping(state, character);
		state = spec ? state.update(spec).state : state.update(state.replaceSelection(character)).state;
	}
	const { from: start, to: end } = state.selection.main;
	const doc = state.doc.toString();
	return `${doc.slice(0, start)}[${doc.slice(start, end)}]${doc.slice(end)}`;
}

describe('typing over a selection', () => {
	it('wraps words in the syntax typed, and keeps them selected', () => {
		expect(type('中文加粗中文', 2, 4, '*')).toBe('中文*[加粗]*中文');
	});

	it('wraps again for the second character, making bold', () => {
		expect(type('中文加粗中文', 2, 4, '*', '*')).toBe('中文**[加粗]**中文');
	});

	it('wraps code, strike and a link text', () => {
		expect(type('a b c', 2, 3, '`')).toBe('a `[b]` c');
		expect(type('a b c', 2, 3, '~', '~')).toBe('a ~~[b]~~ c');
		expect(type('a b c', 2, 3, '[')).toBe('a [[b]] c');
	});

	it('wraps each line on its own when the selection crosses lines', () => {
		expect(type('one\n\ntwo', 0, 8, '*', '*')).toBe('**[one**\n\n**two]**');
	});

	it('quotes every line the selection touches', () => {
		expect(type('one\ntwo', 1, 5, '>')).toBe('[> one\n> two]');
	});

	it('fences lines when a backtick is typed over them', () => {
		expect(type('let a;\nlet b;', 0, 13, '`')).toBe('```\n[let a;\nlet b;]\n```');
	});

	it('replaces the selection with anything that is not syntax', () => {
		expect(type('a b c', 2, 3, 'x')).toBe('a x[] c');
	});
});

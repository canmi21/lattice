/**
 * Deleting one side of a mark deletes its other side. See text-pairs.ts.
 */
import { syntaxTree } from '@canmi/compile/parser';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { pairedDelete } from './text-pairs.ts';

/** The text after deleting at the caret `|`: Backspace, or Delete when `forward`. */
function press(marked: string, forward = false): string {
	const at = marked.indexOf('|');
	const text = marked.replace('|', '');
	let state = EditorState.create({ doc: text, selection: EditorSelection.cursor(at) });
	const spec = pairedDelete(state, syntaxTree(text), forward);
	state = spec
		? state.update(spec).state
		: state.update({ changes: forward ? { from: at, to: at + 1 } : { from: at - 1, to: at } })
				.state;
	const head = state.selection.main.head;
	const doc = state.doc.toString();
	return `${doc.slice(0, head)}|${doc.slice(head)}`;
}

describe('paired deletion', () => {
	it('turns bold into italic from either side, then into words', () => {
		expect(press('**|加粗**')).toBe('*|加粗*');
		expect(press('*|加粗*')).toBe('|加粗');
		expect(press('**加粗**|')).toBe('*加粗*|');
		expect(press('**加粗|**', true)).toBe('*加粗|*');
	});

	it('pairs strike and code', () => {
		expect(press('a ~~|b~~ c')).toBe('a ~|b~ c');
		expect(press('a `b`| c')).toBe('a b| c');
	});

	it('takes the layer the delimiter belongs to', () => {
		expect(press('***|x***')).toBe('**|x**');
		expect(press('*|**x***')).toBe('|**x**');
	});

	it('deletes a delimiter nothing answers on its own', () => {
		expect(press('a **|open')).toBe('a *|open');
	});

	it('leaves a link whole', () => {
		expect(press('[|a](https://example.com)')).toBe('|a](https://example.com)');
	});
});

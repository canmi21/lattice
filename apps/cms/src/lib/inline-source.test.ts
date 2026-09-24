/**
 * The marked words under the caret open as markdown and close back into marks. See
 * inline-source.ts.
 */
import { editorViewCtx, serializerCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import type { Node } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';
import { afterEach, describe, expect, it } from 'vitest';
import { inlineSource, settled } from './inline-source.ts';
import { makeEditor } from './test-editor.ts';

let editor: Editor | undefined;

afterEach(async () => {
	await editor?.destroy();
	editor = undefined;
});

async function open(markdown: string) {
	editor = await makeEditor(markdown, [inlineSource('')].flat());
	return editor;
}

/** Where `needle` starts in the document, plus `into` characters. */
function at(doc: Node, needle: string, into = 0): number {
	let found = -1;
	doc.descendants((node, position) => {
		if (found >= 0 || !node.isText) return found < 0;
		const index = node.text!.indexOf(needle);
		if (index >= 0) found = position + index + into;
		return false;
	});
	if (found < 0) throw new Error(`no "${needle}" in ${doc.textContent}`);
	return found;
}

function caret(target: Editor, needle: string, into = 0) {
	target.action((ctx) => {
		const view = ctx.get(editorViewCtx);
		const position = at(view.state.doc, needle, into);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)));
	});
}

function type(target: Editor, text: string) {
	target.action((ctx) => {
		const view = ctx.get(editorViewCtx);
		view.dispatch(view.state.tr.insertText(text));
	});
}

function erase(target: Editor, count: number) {
	target.action((ctx) => {
		const view = ctx.get(editorViewCtx);
		const { from } = view.state.selection;
		view.dispatch(view.state.tr.delete(from - count, from));
	});
}

const text = (target: Editor) =>
	target.action((ctx) => ctx.get(editorViewCtx).state.doc.textContent);

const saved = (target: Editor) =>
	target.action((ctx) =>
		ctx
			.get(serializerCtx)(settled(ctx, ctx.get(editorViewCtx).state))
			.trim(),
	);

describe('inline source', () => {
	it('opens bold words as their asterisks and closes them back', async () => {
		const target = await open('Plain **bold** end.\n\nOther.\n');
		caret(target, 'bold', 2);
		expect(text(target)).toBe('Plain **bold** end.Other.');
		caret(target, 'Other');
		expect(text(target)).toBe('Plain bold end.Other.');
		expect(saved(target)).toBe('Plain **bold** end.\n\nOther.');
	});

	it('opens the smallest unit: the marked run, not the sentence', async () => {
		const target = await open('a **b *c* d** e\n');
		caret(target, 'c', 0);
		expect(text(target)).toBe('a **b *c* d** e');
		expect(saved(target)).toBe('a **b *c* d** e');
	});

	it('saves what the open source means, not its asterisks as text', async () => {
		const target = await open('Plain **bold** end.\n');
		caret(target, 'bold', 1);
		expect(saved(target)).toBe('Plain **bold** end.');
	});

	it('reads an edit made in the source back into marks', async () => {
		const target = await open('Plain **bold** end.\n\nOther.\n');
		caret(target, 'bold', 1);
		// `**bold**` becomes `*bold*`: one asterisk off each side.
		caret(target, 'bold**', 5);
		erase(target, 1);
		caret(target, '*bold', 1);
		erase(target, 1);
		caret(target, 'Other');
		expect(saved(target)).toBe('Plain *bold* end.\n\nOther.');
	});

	it('leaves syntax that does not close as the text it is', async () => {
		const target = await open('Plain **bold** end.\n\nOther.\n');
		caret(target, 'bold', 1);
		caret(target, 'bold**', 6);
		erase(target, 2);
		caret(target, 'Other');
		expect(text(target)).toBe('Plain **bold end.Other.');
	});

	it('opens a note so its text can be changed, and keeps what was changed', async () => {
		const target = await open('Words :fn[here]{is="old"} after.\n\nOther.\n');
		caret(target, 'here', 1);
		expect(text(target)).toBe('Words :fn[here]{is="old"} after.Other.');
		caret(target, 'old"', 3);
		erase(target, 3);
		type(target, 'new');
		caret(target, 'Other');
		expect(saved(target)).toBe('Words :fn[here]{is="new"} after.\n\nOther.');
	});
});

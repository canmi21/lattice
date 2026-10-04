/**
 * Moving, duplicating and deleting a block keeps the blocks apart. See blocks.ts.
 */
import { syntaxTree } from '@canmi/compile/parser';
import { type ChangeSpec, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { duplicate, islands, move, remove } from './blocks.ts';

const TEXT = 'One.\n\n## Two\n\n::image{src=x}\n\nFour **bold**.';

function apply(changes: ChangeSpec): string {
	const state = EditorState.create({ doc: TEXT });
	return state.update({ changes }).state.doc.toString();
}

const list = islands(TEXT, syntaxTree(TEXT));

describe('blocks', () => {
	it('lists the blocks, and which have a source to open', () => {
		expect(list.map((block) => `${TEXT.slice(block.from, block.to)}|${block.sourced}`)).toEqual([
			'One.|false',
			'## Two|false',
			'::image{src=x}|true',
			'Four **bold**.|false',
		]);
	});

	it('moves a block down, up, and to the end, keeping the blocks apart', () => {
		expect(apply(move(TEXT, list, 0, 2)!.changes)).toBe(
			'## Two\n\nOne.\n\n::image{src=x}\n\nFour **bold**.',
		);
		expect(apply(move(TEXT, list, 3, 0)!.changes)).toBe(
			'Four **bold**.\n\nOne.\n\n## Two\n\n::image{src=x}',
		);
		expect(apply(move(TEXT, list, 1, 4)!.changes)).toBe(
			'One.\n\n::image{src=x}\n\nFour **bold**.\n\n## Two',
		);
	});

	it('does nothing where a block would land where it is', () => {
		expect(move(TEXT, list, 1, 1)).toBeNull();
		expect(move(TEXT, list, 1, 2)).toBeNull();
	});

	it('duplicates a block after itself', () => {
		expect(apply(duplicate(TEXT, list, 1)!)).toBe(
			'One.\n\n## Two\n\n## Two\n\n::image{src=x}\n\nFour **bold**.',
		);
	});

	it('deletes a block with its separation, the last one included', () => {
		expect(apply(remove(list, 0)!)).toBe('## Two\n\n::image{src=x}\n\nFour **bold**.');
		expect(apply(remove(list, 3)!)).toBe('One.\n\n## Two\n\n::image{src=x}');
	});
});

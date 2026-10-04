import { describe, expect, it } from 'vitest';
import { syntaxTree } from './parser.ts';

/** Whether the first paragraph holds a mark of `type`. */
function marked(markdown: string, type: string): boolean {
	const first = syntaxTree(markdown).children[0];
	return !!first && 'children' in first && first.children.some((node) => node.type === type);
}

describe('the article parser', () => {
	it('closes emphasis against CJK punctuation without a space', () => {
		expect(marked('中文**「引号」**中文', 'strong')).toBe(true);
		expect(marked('中文**加粗。**中文', 'strong')).toBe(true);
		expect(marked('价格是**100%**对吧', 'strong')).toBe(true);
		expect(marked('看**`code`**这里', 'strong')).toBe(true);
		expect(marked('删掉~~「这个」~~了', 'delete')).toBe(true);
	});

	it('leaves English flanking as CommonMark has it', () => {
		expect(marked('a**"b"**c', 'strong')).toBe(false);
		expect(marked('a **"b"** c', 'strong')).toBe(true);
	});
});

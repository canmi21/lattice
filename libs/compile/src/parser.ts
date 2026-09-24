/**
 * The parser every article is read with: remark, with frontmatter, GFM and directives.
 *
 * One instance, in a module that reads nothing at load, so the editor in the browser reads text
 * with exactly the parser the site compiles with -- the site's parser is the judge of what a text
 * means, and a second parser would be a second judge. See spec/architecture/local.md, "The
 * editor's document is the markdown text".
 */
import type { Root } from 'mdast';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export const parser = unified()
	.use(remarkParse)
	.use(remarkFrontmatter, ['yaml'])
	.use(remarkGfm)
	.use(remarkDirective);

/** An article's syntax tree as the site reads it, before anything is compiled from it. */
export function syntaxTree(markdown: string): Root {
	return parser.parse(markdown) as Root;
}

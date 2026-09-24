/**
 * The parser every article is read with: remark, with frontmatter, GFM and directives.
 *
 * One instance, in a module that reads nothing at load, so the editor in the browser reads text
 * with exactly the parser the site compiles with -- the site's parser is the judge of what a text
 * means, and a second parser would be a second judge. See spec/architecture/local.md, "The
 * editor's document is the markdown text".
 */
import type { Root } from 'mdast';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkCjkFriendlyGfmStrikethrough from 'remark-cjk-friendly-gfm-strikethrough';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

/**
 * CommonMark's flanking rules decide whether `**` opens or closes by the characters either side,
 * and they assume words are spaced: `中文**「引号」**中文` stays asterisks, because a delimiter
 * between a letter and punctuation needs a space the language does not write. The CJK-friendly
 * extension relaxes that where a CJK character is the neighbour and nowhere else. Measured on
 * adoption: no article or draft parsed differently with it. See spec/architecture/local.md, "The
 * site's parser is the judge".
 */
export const parser = unified()
	.use(remarkParse)
	.use(remarkFrontmatter, ['yaml'])
	.use(remarkGfm)
	.use(remarkDirective)
	.use(remarkCjkFriendly)
	.use(remarkCjkFriendlyGfmStrikethrough);

/** An article's syntax tree as the site reads it, before anything is compiled from it. */
export function syntaxTree(markdown: string): Root {
	return parser.parse(markdown) as Root;
}

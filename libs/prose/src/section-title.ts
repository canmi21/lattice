/**
 * The heading's own style, and the class it resolves to, kept out of the component.
 *
 * `rail-measure.ts` in the site asks the stylesheet what a heading is set in rather than keeping
 * a second copy of the number, and it now asks across a package boundary -- where a named export
 * from a `.svelte` file is not something a type checker on the other side can read. So the style
 * lives in a module both sides resolve the same way. See spec/architecture/css/authoring.md.
 */
import * as stylex from '@stylexjs/stylex';
import { weight } from '@canmi/tokens/vocabulary.stylex';

export const titleStyles = stylex.create({
	title: {
		color: 'var(--color-text-strong)',
		// 40 over the site's own `strong`. Which of the two a heading should be is a question nobody
		// answered. See spec/todo/css.md.
		fontWeight: weight.semibold,
	},
});

/** What a heading's class resolves to; see article.svelte, `ARTICLE_BODY_CLASS`. */
export const SECTION_TITLE_CLASS = stylex.attrs(titleStyles.title).class ?? '';

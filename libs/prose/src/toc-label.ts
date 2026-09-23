/**
 * A rail label's own style, kept out of the component for `rail-measure.ts` to read.
 *
 * The third of these, and the last: `article-body.ts` and `section-title.ts` are the same shape
 * for the same reason -- a class that a measurement needs cannot be a named export of a
 * `.svelte` file once the measurement and the component are in different packages.
 */
import * as stylex from '@stylexjs/stylex';
import { line, text } from '@canmi/tokens/vocabulary.stylex';

export const labelStyles = stylex.create({
	label: {
		fontSize: text.px13,
		// The line is Tailwind's `--leading-snug`, and its value is written out rather than read:
		// that variable is emitted only for the utilities that name it, so reading it here would
		// leave this line depending on a class somewhere else in the markup.
		lineHeight: line.snug,
	},
});

/** What a rail label's class resolves to; see `article-body.ts`, `ARTICLE_BODY_CLASS`. */
export const TOC_LABEL_CLASS = stylex.attrs(labelStyles.label).class ?? '';

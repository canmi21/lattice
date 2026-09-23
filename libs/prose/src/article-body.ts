/**
 * The measure an article's prose is set in, kept out of the component that draws it.
 *
 * `rail-measure.ts` asks the stylesheet what the body is set in rather than keeping a second
 * copy of the number, and the rail now lives in a package while the page around it does not --
 * where a named export from a `.svelte` file is not something the other side can read. Same
 * reason as `section-title.ts`, and the same fix. See spec/architecture/css/authoring.md.
 */
import * as stylex from '@stylexjs/stylex';
import { line, text } from '@canmi/tokens/vocabulary.stylex';

export const bodyStyles = stylex.create({
	body: {
		fontSize: text.px15,
		lineHeight: line.relaxed,
	},
});

/** What the article body's class resolves to, for a measurement taken before it is on screen. */
export const ARTICLE_BODY_CLASS = stylex.attrs(bodyStyles.body).class ?? '';

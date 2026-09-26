import * as stylex from '@stylexjs/stylex';
import { radius } from '@canmi/tokens/vocabulary.stylex';

/**
 * The visual half of the table of contents. Every colour is the token variable `libs/tokens`
 * already declares, so nothing here can change one. See spec/architecture/css/authoring.md.
 *
 * Nothing here draws a bar's width or the indicator's height. Those are measured and written
 * inline by the script below, an inline style outranks every layer, and this one only says
 * what the marks are made of.
 */
export const styles = stylex.create({
	/**
	 * The rail's own offset near the end of an article, on top of the box's vertical centring.
	 *
	 * Here rather than in the markup because no utility translates a `transform` -- Tailwind 4
	 * writes `translate` as its own property, a different declaration with a different computed
	 * value. See spec/architecture/css/migration.md, "No utility translates a `transform`
	 * declaration". Horizontal placement stays the rail box's, in utilities.css.
	 */
	nav: {
		transform: 'translateY(var(--toc-end-offset, 0rem))',
	},
	/** The bar marking the entry being read. Its height and its offset are the animation's. */
	indicator: {
		borderRadius: radius.full,
		backgroundColor: 'var(--color-text-soft)',
	},
	entry: {
		// The ring belongs to one of the two wrappers inside, which `focus-ring-inner` draws
		// around the bar while the column is collapsed and around the label once it is not.
		outlineStyle: { default: null, ':focus-visible': 'none' },
	},
	/** The wrapper the ring is drawn on while the column is collapsed. */
	barRing: {
		borderRadius: radius.full,
	},
	/** The collapsed thumbnail of one heading. The width it is drawn at stays inline. */
	bar: {
		borderRadius: radius.full,
		backgroundColor: 'var(--color-text-soft)',
	},
	labelActive: {
		color: 'var(--color-text-strong)',
	},
	labelIdle: {
		color: 'var(--color-text-soft)',
	},
});

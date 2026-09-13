import * as stylex from '@stylexjs/stylex';
import { border, radius, weight } from '$lib/vocabulary.stylex.ts';

/**
 * The declaration groups the visual layer repeats, each with one name.
 *
 * [`vocabulary.stylex.ts`](./vocabulary.stylex.ts) names the values; this names the sets built out
 * of them. A component composes one in by passing it to `stylex.attrs` ahead of its own style --
 * `stylex.attrs(surfaces.heading, styles.groupTitle)` -- and keeps whatever the group does not say.
 *
 * "Surface" is spec/architecture/css.md's word for a set of declarations with a name used in
 * several places, and it is the word `utilities.css`'s vocabulary was already described in. A
 * group earns one at three components, the same threshold the values are held to.
 *
 * **The merge unit is the property, not the property and its condition.** A group carrying only
 * `{ '@media (prefers-reduced-motion: reduce)': 'none' }` for a property the component also
 * declares does not add a branch to it -- the component's entry replaces the group's whole class
 * string for that property, silently, and the branch is gone. Measured on the pinned plugin, and
 * the stylesheet cannot show it: both forms compile the same classes, so only the element's class
 * attribute records which of them it wears. So a group holds whole properties, and a set whose
 * members are conditional branches over defaults that differ per site cannot live here at all.
 * The reduced-motion answer is the standing example. See spec/todo.md.
 *
 * **A key's spelling is not part of the stylesheet**, unlike a constant's, so renaming one here is
 * free where renaming one in the vocabulary rewrites rules. That makes a wrong name cheap to fix
 * and therefore easy to leave: nothing outside this file ever forces one to be right, and a name
 * that has drifted from what it describes is worse than the literal it replaced, because a literal
 * cannot lie.
 */
export const surfaces = stylex.create({
	/**
	 * The frame a full-width block draws around itself: the code block, the Mermaid figure and the
	 * quadrant.
	 *
	 * The three did not arrive at these five separately. At the commit before the migration all
	 * three carried the one Tailwind string `overflow-hidden rounded-xl border border-border
	 * bg-paper`, so this is one decision translated three times rather than a paste.
	 *
	 * The search panel's five are identical and are deliberately not this. A panel that opens over
	 * the page is not a block in an article, and the corner they agree on today is the only thing
	 * they share.
	 */
	blockFrame: {
		borderRadius: radius.xl,
		borderWidth: border.hairlinePx,
		borderStyle: 'solid',
		borderColor: 'var(--color-border)',
		backgroundColor: 'var(--color-paper)',
	},

	/**
	 * What a heading is made of, which on this site is two declarations and no size.
	 *
	 * Thin for a group, and admitted on identity rather than on length: twelve keys write exactly
	 * this pair and in ten of them it is the whole style object, which is the strongest signal in
	 * the tree that the two are one decision. The size is not part of it -- most of the twelve take
	 * the size their tag already has, and the two that do not disagree with each other.
	 *
	 * Not the support pill, which writes the same pair and is a control. A heading's name on a
	 * control would be the drift the header above warns about; the pill's label shares a treatment
	 * with a heading rather than being one.
	 */
	heading: {
		color: 'var(--color-text-strong)',
		fontWeight: weight.medium,
	},
});

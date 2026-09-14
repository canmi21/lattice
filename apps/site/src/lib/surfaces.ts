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

/**
 * The four declarations of a bordered paper surface, which eight components draw.
 *
 * Kept out of `stylex.create` so `blockFrame` below is visibly the same thing with a corner rather
 * than a second spelling of it. The radius is not among them because no two of the eight agree on
 * one: `md` on the menu and the popover, `lg` on the modal, `xl` on the three block frames and the
 * search panel, `full` on the newsletter's pill.
 *
 * `borderStyle` is stated rather than omitted. The markup these came from wrote Tailwind's
 * `border`, which sets the style through `--tw-border-style`, registered with `solid` as its
 * initial value, so the edge computed to solid and leaving it out here would not keep it there.
 *
 * `hairlinePx` is what makes the cargo and tokei tooltips not members. They draw a paper ground
 * with the `hairlineRem` spelling, and the two are one length at the default root size and at no
 * other. See spec/todo.md.
 */
const paper = {
	backgroundColor: 'var(--color-paper)',
	borderWidth: border.hairlinePx,
	borderStyle: 'solid',
	borderColor: 'var(--color-border)',
};

export const surfaces = stylex.create({
	/**
	 * The ground every route stands on: the page's own colour and the ink that inherits from it
	 * into everything the route renders.
	 *
	 * Seven components write these two, and in five of them they are the whole style object, which
	 * makes this the largest single duplication the visual layer had left.
	 *
	 * One declaration on `body` would be the better repair and is deliberately not taken here: it
	 * would move which element carries the colour, and that is a rendering change rather than a
	 * merge of two definitions that already agree. See spec/todo.md.
	 */
	page: {
		backgroundColor: 'var(--color-page)',
		color: 'var(--color-text)',
	},

	paper,

	/**
	 * The frame a full-width block draws around itself: the code block, the Mermaid figure and the
	 * quadrant.
	 *
	 * It is `paper` with a corner, written as the spread so that the two cannot part company.
	 *
	 * The three did not arrive at these five separately. At the commit before the migration all
	 * three carried the one Tailwind string `overflow-hidden rounded-xl border border-border
	 * bg-paper`, so this is one decision translated three times rather than a paste.
	 *
	 * The search panel's five are identical and are deliberately not this. A panel that opens over
	 * the page is not a block in an article, and the corner they agree on today is the only thing
	 * they share.
	 */
	blockFrame: { ...paper, borderRadius: radius.xl },

	/**
	 * Bordered paper that answers a pointer: the repository card, the tweet card and the support
	 * pill each darken the border and the ground together on hover and on focus.
	 *
	 * **The rem hairline is what all three carry, not a ruling that they should.** It is
	 * `hairlineRem` here against `paper`'s `hairlinePx`, with no exception on either side, so this
	 * is not that surface with states added: the two draw their border in different units and part
	 * company the moment a reader enlarges text. Whether they should be one hairline is open, and
	 * composing this onto `paper` to find out would set the border twice and let the second win
	 * silently. See spec/todo.md.
	 *
	 * `:hover` is bare, with no `(hover: hover)` around it, because a bare one is what the rules
	 * these replaced were written as. Sameness first; see spec/architecture/css.md.
	 *
	 * The transition the three run is not here and cannot be: its reduced-motion branch travels
	 * with a default, and the cards name two properties where the pill names three. Nor is the
	 * radius, which is `radius.xl` on the cards and a pill on the pill.
	 */
	interactive: {
		borderWidth: border.hairlineRem,
		borderStyle: 'solid',
		borderColor: {
			default: 'var(--color-border)',
			':hover': 'var(--color-border-strong)',
			':focus-visible': 'var(--color-border-strong)',
		},
		backgroundColor: {
			default: 'var(--color-paper)',
			':hover': 'var(--color-paper-hover)',
			':focus-visible': 'var(--color-paper-hover)',
		},
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

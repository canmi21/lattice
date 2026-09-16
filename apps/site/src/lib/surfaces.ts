import * as stylex from '@stylexjs/stylex';
import { border, leading, radius, text, weight } from '$lib/vocabulary.stylex.ts';

/**
 * The declaration groups the visual layer repeats, each with one name -- `vocabulary.stylex.ts`
 * names the values, this names the sets built from them, at the same three-component threshold.
 * A group holds whole properties only, never a conditional branch over a default that differs
 * per site -- see spec/architecture/css/extraction.md, "The merge unit is the property, not the
 * property and its condition". A key's spelling is not part of the stylesheet, so a drifted name is
 * cheap to fix and easy to leave wrong.
 */

/**
 * The four declarations of a bordered paper surface, which eight components draw. Kept out of
 * `stylex.create` so `blockFrame` below is visibly the same thing with a corner. The radius is
 * not among them: no two of the eight agree on one. `borderStyle` is stated rather than omitted
 * -- see spec/architecture/css/extraction.md, "An omitted longhand is not its initial value when a
 * shorthand registered it". `hairlinePx` is what excludes the cargo and tokei tooltips, which draw
 * the same ground with `hairlineRem`. See spec/todo.md.
 */
const paper = {
	backgroundColor: 'var(--color-paper)',
	borderWidth: border.hairlinePx,
	borderStyle: 'solid',
	borderColor: 'var(--color-border)',
};

export const surfaces = stylex.create({
	/**
	 * The ground every route stands on: the page's own colour and the ink that inherits from it.
	 * This removes the duplication of seven components writing the same two declarations, but not
	 * the question underneath it -- one line on `body` would be the better repair. See
	 * spec/todo.md, "The page ground is now one name, and the repair it is standing in for is one
	 * line on `body`".
	 */
	page: {
		backgroundColor: 'var(--color-page)',
		color: 'var(--color-text)',
	},

	paper,

	/**
	 * The frame a full-width block draws around itself: the code block, the Mermaid figure and
	 * the quadrant. `paper` with a corner, written as the spread so the two cannot part company --
	 * all three carried the one Tailwind string `overflow-hidden rounded-xl border border-border
	 * bg-paper` before the migration, so this is one decision translated three times. The search
	 * panel's identical five are deliberately not this: a panel over the page is not a block in
	 * an article, and the corner is the only thing they share today.
	 */
	blockFrame: { ...paper, borderRadius: radius.xl },

	/**
	 * Bordered paper that answers a pointer: the repository card, the tweet card and the support pill
	 * each darken the border and the ground on hover and focus. The `hairlineRem` is not a ruling
	 * against `paper`'s `hairlinePx` -- see spec/todo.md, "Two named surfaces disagree about what a
	 * hairline is, and each is internally consistent". `:hover` is bare, with no `(hover: hover)`,
	 * matching the rules it replaced (sameness first; spec/architecture/css/migration.md). The
	 * transition and the radius are not here: neither is common to all three.
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
	 * The compact icon-and-label control a metadata row is made of. See spec/styling/focus.md, "Quiet
	 * metadata controls share one surface" (why this replaced the `.quiet-control` class) and
	 * spec/todo.md, "A recipe's other half is a convention and nothing checks that a call site
	 * kept it" (why only the appearance is here). `:hover` is bare (sameness first,
	 * spec/architecture/css/migration.md). `outline: none` also resets width and colour, to `medium`/
	 * `currentcolor` rather than the `0.125rem` accent base-layer `:focus-visible` sets.
	 */
	quietControl: {
		// Visual under the rule in spec/architecture/css/layers.md: it moves nothing, it says what the
		// element is to a pointer.
		cursor: 'pointer',
		borderRadius: '0.125rem',
		color: {
			default: 'var(--color-text-soft)',
			':hover': 'var(--color-text-strong)',
			':focus-visible': 'var(--color-text-strong)',
		},
		backgroundColor: {
			default: null,
			':hover': 'var(--color-paper-hover)',
			':focus-visible': 'var(--color-paper-hover)',
		},
		// Doubled because two properties transition: spec/todo.md, "A `transition` shorthand
		// sets five lists and the migrated form writes three".
		transitionProperty: 'color, background-color',
		transitionDuration: '200ms, 200ms',
		transitionTimingFunction: 'ease, ease',
		transitionDelay: '0s, 0s',
		outlineStyle: { default: null, ':focus-visible': 'none' },
		outlineWidth: { default: null, ':focus-visible': 'medium' },
		outlineColor: { default: null, ':focus-visible': 'currentColor' },
	},

	/**
	 * The interface's own type step: fourteen pixels with the line that step computes to. Six
	 * components take the pair; the other sites of `text.px14` override the line on purpose, so
	 * it is the pair that marks interface text. The line is a length rather than `text-sm`'s
	 * ratio, which does not terminate and rounds to a shorter element -- see
	 * spec/architecture/css/authoring.md, "A ratio that does not terminate cannot be written as a
	 * ratio". `leading.px20` has no site that is not one of these six.
	 */
	uiText: {
		fontSize: text.px14,
		lineHeight: leading.px20,
	},

	/**
	 * What a heading is made of: two declarations and no size, admitted on identity rather than
	 * on length -- twelve keys write exactly this pair, ten of them as the whole style object.
	 * Not the support pill, which writes the same pair but is a control: naming it `heading` would
	 * be the drift the file-opening comment warns a wrong name invites.
	 */
	heading: {
		color: 'var(--color-text-strong)',
		fontWeight: weight.medium,
	},
});

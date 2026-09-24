/**
 * What floats over the pane -- the draft's toolbar at its foot, the sidebar's control at its top
 * left -- and the controls on it. One look for both, the menu's: `paper`, the deepest surface in
 * dark, with an edge and a shadow -- a pill, or a rounded rectangle in a corner; controls lit at rest and answered by a round ground
 * under the pointer. See spec/architecture/local.md.
 */
import * as stylex from '@stylexjs/stylex';
import { radius } from '@canmi/tokens/vocabulary.stylex';

export const floating = stylex.create({
	pill: {
		backgroundColor: 'var(--color-paper)',
		borderRadius: radius.full,
		boxShadow: '0 0.5rem 1.5rem oklch(0 0 0 / 0.12), 0 0 0 1px var(--color-border)',
	},
	// The same ground in a rounded rectangle rather than a pill, for the sidebar's control in the
	// pane's corner: applied after `pill`, it changes the corner and nothing else.
	corner: {
		borderRadius: radius.lg,
	},
	// Drawn over `surfaces.quietControl`, which brings the ground under the pointer: lit rather than
	// soft at rest, and round.
	control: {
		color: 'var(--color-text-strong)',
		borderRadius: radius.full,
	},
});

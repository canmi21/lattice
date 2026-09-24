/**
 * What floats over the pane's text -- the draft's toolbar at its foot -- and the controls on it, in
 * the menu's look: `paper`, the deepest surface in dark, as a pill with an edge and a shadow;
 * controls lit at rest and answered by a round ground under the pointer. The sidebar's float in
 * the pane's corner is chrome around the pane rather than something over it, and keeps the
 * sidebar's ground instead. See spec/architecture/local.md.
 */
import * as stylex from '@stylexjs/stylex';
import { radius } from '@canmi/tokens/vocabulary.stylex';

export const floating = stylex.create({
	pill: {
		backgroundColor: 'var(--color-paper)',
		borderRadius: radius.full,
		boxShadow: '0 0.5rem 1.5rem oklch(0 0 0 / 0.12), 0 0 0 1px var(--color-border)',
	},
	// Drawn over `surfaces.quietControl`, which brings the ground under the pointer: lit rather than
	// soft at rest, and round.
	control: {
		color: 'var(--color-text-strong)',
		borderRadius: radius.full,
	},
});

/**
 * The color each verdict is drawn in, slot, legend and tip alike: nothing a step off the card, fine
 * green, planned busy blue, degraded amber, down red. See spec/console/overview.md, "A line
 * is any of three things, or the worst of them".
 */
import * as stylex from '@stylexjs/stylex';

export const painted = stylex.create({
	none: { backgroundColor: 'color-mix(in srgb, var(--color-text) 9%, transparent)' },
	fine: { backgroundColor: 'var(--color-good)' },
	planned: { backgroundColor: 'var(--color-busy)' },
	degraded: { backgroundColor: 'var(--color-warn)' },
	down: { backgroundColor: 'var(--color-danger)' },
});

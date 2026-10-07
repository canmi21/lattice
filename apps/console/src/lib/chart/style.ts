import * as stylex from '@stylexjs/stylex';
import {
	border,
	duration,
	figures,
	radius,
	text,
	weight,
} from '@canmi/kit/tokens/vocabulary.stylex';

/**
 * What every chart's chrome shares: recessive hairlines, axis text in a text token, the tooltip.
 * The data is the only thing in a chart allowed to be loud.
 */
export const chart = stylex.create({
	axis: {
		color: 'var(--color-text-faint)',
		fontSize: text.px11,
		fontVariantNumeric: figures.tabular,
		lineHeight: 1,
	},
	/** A gridline as an element: a hairline one step off the surface. */
	grid: { backgroundColor: 'var(--color-line)' },
	baseline: { backgroundColor: 'var(--color-line-strong)' },
	gridStroke: { stroke: 'var(--color-line)', strokeWidth: 1 },
	baselineStroke: { stroke: 'var(--color-line-strong)', strokeWidth: 1 },
	crosshair: { stroke: 'var(--color-text-muted)', strokeWidth: 1 },
	marker: { stroke: 'var(--color-text-faint)', strokeWidth: 1 },
	/** A mark's dot, ringed in the surface so it stays legible where it crosses a line. */
	dot: { borderRadius: radius.full, boxShadow: '0 0 0 2px var(--color-surface)' },
	tooltip: {
		backgroundColor: 'var(--color-raised)',
		borderWidth: border.hairlinePx,
		borderStyle: 'solid',
		borderColor: 'var(--color-line-strong)',
		borderRadius: radius.lg,
		boxShadow: '0 8px 24px rgb(0 0 0 / 0.35)',
	},
	value: {
		color: 'var(--color-text-strong)',
		fontSize: text.px12,
		fontWeight: weight.semibold,
		fontVariantNumeric: figures.tabular,
	},
	/** A legend's or a tooltip's key: a short stroke for a line, a square for a fill. */
	keyLine: { borderRadius: radius.full },
	keyRect: { borderRadius: radius.sm },
	/** A hit target over a mark: invisible until the pointer or the keyboard is on it. */
	hit: {
		backgroundColor: {
			default: 'transparent',
			':hover': 'color-mix(in srgb, var(--color-text) 6%, transparent)',
			':focus-visible': 'color-mix(in srgb, var(--color-text) 6%, transparent)',
		},
		borderWidth: 0,
		padding: 0,
		cursor: 'default',
	},
	/** The previous drawing, held while the next is read: no skeleton, no jump. */
	stale: { opacity: 0.5, transitionProperty: 'opacity', transitionDuration: duration.base },
	fresh: { opacity: 1, transitionProperty: 'opacity', transitionDuration: duration.base },
});

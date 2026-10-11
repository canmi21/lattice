import * as stylex from '@stylexjs/stylex';
import { borderWidth } from '@canmi/design/scale.stylex';
import { border, family, figures, radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';

/**
 * The console's recipes, on the palette's semantic names and the kit's vocabulary: color, type,
 * border and radius here, where a thing sits in the markup. See spec/architecture/css/layers.md.
 */
export const surfaces = stylex.create({
	/** The sidebar, on the ground and ruled off from the page a step fainter than a card is. */
	sidebar: {
		backgroundColor: 'var(--background-base)',
		borderRightWidth: borderWidth.hairline,
		borderRightStyle: 'solid',
		borderRightColor: 'var(--border-subtle)',
	},
	/** The top bar, ruled off as the sidebar is. */
	bar: {
		backgroundColor: 'var(--color-ground)',
		borderBottomWidth: border.hairlinePx,
		borderBottomStyle: 'solid',
		borderBottomColor: 'var(--color-line-faint)',
	},
	card: {
		backgroundColor: 'var(--color-surface)',
		borderWidth: border.hairlinePx,
		borderStyle: 'solid',
		borderColor: 'var(--color-line)',
		borderRadius: radius.xl,
		boxShadow: 'var(--shadow-card)',
	},
	/** A slot with nothing in it yet, said plainly rather than filled. */
	empty: {
		borderRadius: radius.xl,
	},
	rowRule: {
		borderTopWidth: border.hairlinePx,
		borderTopStyle: 'solid',
		borderTopColor: 'var(--color-line)',
	},
	/** The same rule between the items of a list, and none above the first. */
	listRule: {
		borderTopWidth: border.hairlinePx,
		borderTopStyle: 'solid',
		borderTopColor: { default: 'var(--color-line)', ':first-child': 'transparent' },
	},
	well: {
		backgroundColor: 'var(--color-sunken)',
		borderRadius: radius.lg,
	},
	pill: {
		borderRadius: radius.full,
	},
	dot: {
		borderRadius: radius.full,
		backgroundColor: 'currentColor',
	},
});

export const type = stylex.create({
	title: {
		fontSize: '1.5rem', // unnamed
		fontWeight: weight.semibold,
		letterSpacing: '-0.02em', // unnamed: a display size drawn tight
		color: 'var(--color-text-strong)',
	},
	heading: {
		fontSize: text.px14,
		fontWeight: weight.semibold,
		color: 'var(--color-text-strong)',
	},
	name: {
		fontSize: text.px14,
		fontWeight: weight.medium,
		color: 'var(--color-text-strong)',
	},
	body: {
		fontSize: text.px14,
		color: 'var(--color-text)',
	},
	soft: {
		fontSize: text.px13,
		color: 'var(--color-text-muted)',
	},
	label: {
		fontSize: text.px13,
		color: 'var(--color-text-muted)',
	},
	figure: {
		fontSize: text.px13,
		fontVariantNumeric: figures.tabular,
		color: 'var(--color-text-strong)',
	},
	mono: {
		fontFamily: family.monoTheme,
		fontSize: text.px12,
	},
	/** A figure read out in the shell's face, at the size around it: a percent, a count, a span. */
	shell: {
		fontFamily: 'var(--font-shell)',
		fontVariantNumeric: figures.tabular,
	},
});

/** The one color a state is shown in, wherever it is shown. */
export const tone = stylex.create({
	good: { color: 'var(--color-good)' },
	busy: { color: 'var(--color-busy)' },
	warn: { color: 'var(--color-warn)' },
	bad: { color: 'var(--color-danger)' },
	quiet: { color: 'var(--color-text-muted)' },
});

export type Tone = keyof typeof tone;

/** A state's word washed in its tone. */
export const wash = stylex.create({
	good: { backgroundColor: 'color-mix(in srgb, var(--color-good) 14%, transparent)' },
	busy: { backgroundColor: 'color-mix(in srgb, var(--color-busy) 14%, transparent)' },
	warn: { backgroundColor: 'color-mix(in srgb, var(--color-warn) 14%, transparent)' },
	bad: { backgroundColor: 'color-mix(in srgb, var(--color-danger) 16%, transparent)' },
	quiet: { backgroundColor: 'var(--color-raised)' },
});

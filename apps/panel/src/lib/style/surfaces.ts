import * as stylex from '@stylexjs/stylex';
import { duration, font, radius, text, weight } from './vocabulary.stylex.ts';

/**
 * The declaration groups the panel repeats, each with one name -- the site's
 * libs/kit/tokens/src/surfaces.ts is the pattern. Color, border, radius and type live here; where a
 * thing sits and how big it is stays in the markup. See spec/architecture/css/layers.md, "What each
 * layer owns, by name".
 */
export const surfaces = stylex.create({
	/** The sidebar, a step below the ground. */
	sidebar: {
		backgroundColor: 'var(--color-sunken)',
		borderRightWidth: '1px',
		borderRightStyle: 'solid',
		borderRightColor: 'var(--color-line)',
	},
	/** A card: a bordered surface on the ground. */
	card: {
		backgroundColor: 'var(--color-surface)',
		borderWidth: '1px',
		borderStyle: 'solid',
		borderColor: 'var(--color-line)',
		borderRadius: radius.xl,
	},
	/** A row in a list, lit on hover. */
	row: {
		borderRadius: radius.md,
		backgroundColor: {
			default: 'transparent',
			':hover': 'var(--color-raised)',
		},
		transitionProperty: 'background-color, color',
		transitionDuration: duration.hover,
	},
	/** Text set into the page rather than on it: a log, a failure's detail. */
	well: {
		backgroundColor: 'var(--color-sunken)',
		borderWidth: '1px',
		borderStyle: 'solid',
		borderColor: 'var(--color-line)',
		borderRadius: radius.lg,
		color: 'var(--color-text)',
	},
	divider: {
		backgroundColor: 'var(--color-line-strong)',
	},
	hairline: {
		borderBottomWidth: '1px',
		borderBottomStyle: 'solid',
		borderBottomColor: 'var(--color-line)',
	},
});

/** The type the panel sets, by what it is saying rather than by its size. */
export const type = stylex.create({
	title: {
		color: 'var(--color-text-strong)',
		fontSize: text.px20,
		fontWeight: weight.semibold,
		letterSpacing: '-0.01em',
		lineHeight: 1.25,
	},
	heading: {
		color: 'var(--color-text-strong)',
		fontSize: text.px14,
		fontWeight: weight.semibold,
		lineHeight: 1.4,
	},
	body: {
		color: 'var(--color-text)',
		fontSize: text.px14,
		lineHeight: 1.5,
	},
	muted: {
		color: 'var(--color-text-muted)',
		fontSize: text.px13,
		lineHeight: 1.45,
	},
	/** A column's name or a figure's label. */
	label: {
		color: 'var(--color-text-faint)',
		fontSize: text.px11,
		fontWeight: weight.medium,
		letterSpacing: '0.06em',
		textTransform: 'uppercase',
		lineHeight: 1.3,
	},
	/** A number that sits in a column with others, so its digits line up. */
	figure: {
		color: 'var(--color-text-strong)',
		fontSize: text.px28,
		fontWeight: weight.semibold,
		fontVariantNumeric: 'tabular-nums',
		letterSpacing: '-0.02em',
		lineHeight: 1.1,
	},
	mono: {
		fontFamily: font.mono,
		fontSize: text.px12,
	},
	/** Monospaced at the size of whatever it sits in. */
	monoFace: {
		fontFamily: font.mono,
	},
});

/** The one color a state is shown in, wherever it is shown. */
export const tone = stylex.create({
	good: { color: 'var(--color-good)' },
	warn: { color: 'var(--color-warn)' },
	danger: { color: 'var(--color-danger)' },
	busy: { color: 'var(--color-busy)' },
	muted: { color: 'var(--color-text-muted)' },
	accent: { color: 'var(--color-accent)' },
});

/** Buttons: one shape, and a color per what pressing it does. */
export const controls = stylex.create({
	button: {
		borderWidth: '1px',
		borderStyle: 'solid',
		borderRadius: radius.md,
		fontSize: text.px13,
		fontWeight: weight.medium,
		lineHeight: 1,
		opacity: { default: 1, ':disabled': 0.45 },
		outlineStyle: { default: 'none', ':focus-visible': 'solid' },
		outlineWidth: '2px',
		outlineOffset: '2px',
		outlineColor: 'var(--color-accent)',
		transitionProperty: 'background-color, border-color, color',
		transitionDuration: duration.hover,
	},
	secondary: {
		backgroundColor: {
			default: 'var(--color-raised)',
			':hover:not(:disabled)': 'var(--color-selected)',
		},
		borderColor: 'var(--color-line-strong)',
		color: 'var(--color-text-strong)',
	},
	primary: {
		backgroundColor: { default: 'var(--color-primary)', ':hover:not(:disabled)': 'var(--nord9)' },
		borderColor: 'transparent',
		color: 'var(--nord6)',
	},
	danger: {
		backgroundColor: {
			default: 'transparent',
			':hover:not(:disabled)': 'color-mix(in srgb, var(--color-danger) 16%, transparent)',
		},
		borderColor: 'color-mix(in srgb, var(--color-danger) 55%, transparent)',
		color: 'var(--color-danger)',
	},
	ghost: {
		backgroundColor: { default: 'transparent', ':hover:not(:disabled)': 'var(--color-raised)' },
		borderColor: 'transparent',
		color: {
			default: 'var(--color-text-muted)',
			':hover:not(:disabled)': 'var(--color-text-strong)',
		},
	},
});

/** A state as a small pill: a dot and a word, washed in the state's color. */
export const badges = stylex.create({
	badge: {
		borderRadius: radius.full,
		fontSize: text.px12,
		fontWeight: weight.medium,
		lineHeight: 1,
	},
	dot: {
		borderRadius: radius.full,
		backgroundColor: 'currentColor',
	},
	good: {
		backgroundColor: 'color-mix(in srgb, var(--color-good) 14%, transparent)',
		color: 'var(--color-good)',
	},
	warn: {
		backgroundColor: 'color-mix(in srgb, var(--color-warn) 14%, transparent)',
		color: 'var(--color-warn)',
	},
	danger: {
		backgroundColor: 'color-mix(in srgb, var(--color-danger) 16%, transparent)',
		color: 'var(--color-danger)',
	},
	busy: {
		backgroundColor: 'color-mix(in srgb, var(--color-busy) 14%, transparent)',
		color: 'var(--color-busy)',
	},
	muted: { backgroundColor: 'var(--color-raised)', color: 'var(--color-text-muted)' },
});

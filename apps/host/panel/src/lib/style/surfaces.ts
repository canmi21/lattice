import * as stylex from '@stylexjs/stylex';
import { duration, font, radius, text, weight } from './vocabulary.stylex.ts';

/**
 * The declaration groups the panel repeats, each with one name -- the site's
 * libs/tokens/src/surfaces.ts is the pattern. Colour, border, radius and type live here; where a
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
});

/** The one colour a state is shown in, wherever it is shown. */
export const tone = stylex.create({
	good: { color: 'var(--color-good)' },
	warn: { color: 'var(--color-warn)' },
	danger: { color: 'var(--color-danger)' },
	busy: { color: 'var(--color-busy)' },
	muted: { color: 'var(--color-text-muted)' },
	accent: { color: 'var(--color-accent)' },
});

/**
 * The player's stylex vocabulary, shared by `video-controls.svelte` and the chrome under it.
 */
import * as stylex from '@stylexjs/stylex';
import { duration, easing, figures, radius, text, tracking } from '@canmi/tokens/vocabulary.stylex';

/**
 * The player's own vocabulary, and a member of no named surface in `surfaces.ts`: those are
 * read against the page and these against a video frame. See spec/styling/player.md, "The
 * player brings its own colours, because it cannot know what is behind them", and
 * spec/architecture/css/authoring.md, "Colour is never retyped".
 *
 * A transition naming two properties writes its lists doubled and as literals, the way
 * `surfaces.quietControl` does: spec/todo/todo.md, "A `transition` shorthand sets five lists".
 */
export const styles = stylex.create({
	/**
	 * The disc over the middle of the picture. `transform` is here rather than in the markup
	 * because the frame cannot spell it: Tailwind 4 enlarges with the `scale` property, which
	 * is a different declaration and a different computed value from this one. The three
	 * `outline` longhands are `outline: none` written out, because an omitted longhand is not
	 * its initial value -- measured, the shorthand leaves `currentColor` and `medium` behind
	 * it. See spec/architecture/css/migration.md.
	 */
	cover: {
		borderWidth: 0,
		borderStyle: 'none',
		borderRadius: radius.full,
		color: 'var(--player-ink)',
		backgroundColor: 'var(--player-glass)',
		backdropFilter: 'blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate))',
		WebkitBackdropFilter: 'blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate))',
		// Hidden by default and faded in, on the chrome's curve and duration, because after the
		// first click the two leave together: a clip playing to nobody drops its whole
		// interface at once rather than in two steps. The `:focus-visible` branch is the
		// invisible tab stop -- a ring drawn on a control nobody can see is worse than none.
		opacity: { default: 0, ':focus-visible': 1 },
		transform: { default: null, ':hover': 'scale(1.05)' },
		outlineStyle: { default: null, ':focus-visible': 'none' },
		outlineWidth: { default: null, ':focus-visible': 'medium' },
		outlineColor: { default: null, ':focus-visible': 'currentColor' },
		transitionProperty: {
			default: 'opacity, transform',
			'@media (prefers-reduced-motion: reduce)': 'none',
		},
		transitionDuration: {
			default: '200ms, 200ms',
			'@media (prefers-reduced-motion: reduce)': '0s',
		},
		transitionTimingFunction: {
			default: 'cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1)',
			'@media (prefers-reduced-motion: reduce)': 'ease',
		},
		transitionDelay: { default: '0s, 0s', '@media (prefers-reduced-motion: reduce)': '0s' },
		// The fifth list the shorthand set. Two entries, because a `transition` naming two
		// properties computes to two -- measured, `normal, normal` before and `normal` after
		// when it was left off, which renders the same and is still a value that changed.
		transitionBehavior: {
			default: 'normal, normal',
			'@media (prefers-reduced-motion: reduce)': 'normal',
		},
	},
	/** The cover on screen, which the disc and the picture-in-picture return share. */
	coverShown: { opacity: 1 },

	/**
	 * The still: grey and slightly dimmed, which is the whole message -- this is a picture of
	 * the clip and not the clip. Its fade is not in the reduced-motion branch below and was
	 * not before, so it is carried across as it stands.
	 */
	still: {
		filter: 'grayscale(1) brightness(0.55)',
		opacity: 0,
		transitionProperty: 'opacity',
		transitionDuration: duration.base,
		transitionTimingFunction: easing.inOut,
		transitionDelay: '0s',
	},
	stillShown: { opacity: 1 },

	/**
	 * The veil under the control row, which is a gradient and therefore a background image
	 * rather than a background colour. The row's other half of this pair -- the answer to a
	 * focus inside it -- stays in the scoped block, where a relational selector can reach it.
	 */
	chrome: {
		backgroundImage: 'var(--player-veil)',
		opacity: 0,
		transitionProperty: {
			default: 'opacity',
			'@media (prefers-reduced-motion: reduce)': 'none',
		},
		transitionDuration: {
			default: duration.base,
			'@media (prefers-reduced-motion: reduce)': '0s',
		},
		transitionTimingFunction: {
			default: easing.inOut,
			'@media (prefers-reduced-motion: reduce)': 'ease',
		},
		transitionDelay: { default: '0s', '@media (prefers-reduced-motion: reduce)': '0s' },
	},
	chromeShown: { opacity: 1 },

	/** The ink the row hands down to everything in it. */
	row: { color: 'var(--player-ink)' },

	/**
	 * A control in the row. Hover lights the glyph and draws nothing behind it -- a plate here
	 * would be a plate on the row's own veil, and a bigger visual event than the state it
	 * reports. The wash stays for the menu below, where a highlighted row is the surface
	 * rather than an ornament.
	 */
	button: {
		borderWidth: 0,
		borderStyle: 'none',
		borderRadius: radius.md,
		color: {
			default: 'var(--player-ink-dim)',
			':hover': 'var(--player-ink)',
			':focus-visible': 'var(--player-ink)',
		},
		backgroundColor: 'transparent',
		transitionProperty: { default: 'color', '@media (prefers-reduced-motion: reduce)': 'none' },
		transitionDuration: {
			default: duration.base,
			'@media (prefers-reduced-motion: reduce)': '0s',
		},
		transitionTimingFunction: {
			default: easing.inOut,
			'@media (prefers-reduced-motion: reduce)': 'ease',
		},
		transitionDelay: { default: '0s', '@media (prefers-reduced-motion: reduce)': '0s' },
	},
	/** A toggle reporting that it is on, which is full ink and nothing else. */
	buttonOn: { color: 'var(--player-ink)' },

	/** The elapsed and total time, in figures that do not shift width as they count. */
	clock: {
		fontSize: text.px11,
		fontVariantNumeric: figures.tabular,
		color: 'var(--player-ink-dim)',
		textShadow: 'var(--player-shadow)',
	},

	/**
	 * The scrubber's unfilled bar. Its `outlineColor` is stated at rest for the reason
	 * spec/styling/focus.md gives: an outline's colour is `currentColor` until named, and the
	 * ring this bar is handed would otherwise start from the row's ink.
	 */
	track: {
		borderRadius: radius.full,
		backgroundColor: 'var(--player-ink-faint)',
		outlineColor: 'var(--color-accent)',
	},
	/** Both bars take the track's corner rather than restating it. */
	bar: { borderRadius: 'inherit' },
	loaded: { backgroundColor: 'var(--player-ink-dim)' },
	played: { backgroundColor: 'var(--player-ink)' },

	/**
	 * What the two range inputs share: no ground of their own, and a ring they hand to the bar
	 * a reader can actually see. The three `outline` longhands are `outline: none` written
	 * out, the same as the cover's.
	 */
	slider: {
		backgroundColor: 'transparent',
		outlineStyle: { default: null, ':focus-visible': 'none' },
		outlineWidth: { default: null, ':focus-visible': 'medium' },
		outlineColor: { default: 'var(--color-accent)', ':focus-visible': 'currentColor' },
	},
	/**
	 * The volume slider, closed. The width it opens to lives in the scoped block with the
	 * parent's hover, which no class can express.
	 */
	level: {
		opacity: 0,
		transitionProperty: {
			default: 'width, opacity',
			'@media (prefers-reduced-motion: reduce)': 'none',
		},
		transitionDuration: {
			default: '200ms, 200ms',
			'@media (prefers-reduced-motion: reduce)': '0s',
		},
		transitionTimingFunction: {
			default: 'cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1)',
			'@media (prefers-reduced-motion: reduce)': 'ease',
		},
		transitionDelay: { default: '0s, 0s', '@media (prefers-reduced-motion: reduce)': '0s' },
		transitionBehavior: {
			default: 'normal, normal',
			'@media (prefers-reduced-motion: reduce)': 'normal',
		},
	},

	/**
	 * The settings menu stands away from the frame, so it carries the plate rather than the
	 * veil. Its corner is a literal: 0.625rem is on no scale this repository names.
	 */
	menu: {
		borderRadius: '0.625rem',
		backgroundColor: 'var(--player-glass)',
		backdropFilter: 'blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate))',
		WebkitBackdropFilter: 'blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate))',
	},
	menuTitle: {
		fontSize: text.px10,
		letterSpacing: tracking.caps,
		color: 'var(--player-ink-faint)',
	},
	/** A row in the menu, where the highlight is the surface rather than an ornament on it. */
	menuItem: {
		borderWidth: 0,
		borderStyle: 'none',
		borderRadius: radius.md,
		fontSize: text.px12,
		color: {
			default: 'var(--player-ink-dim)',
			':hover': 'var(--player-ink)',
			':focus-visible': 'var(--player-ink)',
		},
		backgroundColor: {
			default: 'transparent',
			':hover': 'var(--player-wash)',
			':focus-visible': 'var(--player-wash)',
		},
	},
	menuItemOn: { color: 'var(--player-ink)' },
});

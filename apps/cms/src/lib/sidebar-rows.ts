/**
 * How a row in the sidebar is drawn, shared by the sections in `(pane)/+layout.svelte` and the
 * article tree in `article-tree.svelte`, so the two levels stay one scale. See
 * spec/architecture/local.md.
 */
import * as stylex from '@stylexjs/stylex';
import { border, duration, easing, radius } from '@canmi/tokens/vocabulary.stylex';

export const rows = stylex.create({
	// A section is a pill on the ground rather than a word in a list, so its corner is the
	// buttons' rather than the compact control's.
	// Under the pointer a row takes half the current row's ground, so hovering and being chosen
	// read as one scale -- on the sidebar's ground the quiet control's own hover color is the
	// ground itself, and showed nothing. The ink still lifts, from the quiet control.
	item: {
		borderRadius: radius.md,
		backgroundColor: {
			default: null,
			':hover': 'color-mix(in oklab, var(--color-page) 50%, transparent)',
			':focus-visible': 'color-mix(in oklab, var(--color-page) 50%, transparent)',
		},
	},
	// A control on a row rather than a row -- the folder's new-article and chevron -- answers the
	// pointer with its ink alone: only an entry you can go to takes a ground.
	bare: {
		backgroundColor: { default: null, ':hover': 'transparent', ':focus-visible': 'transparent' },
	},
	// The article tree's rows sit with no room between them, so their grounds would meet when two
	// are lit at once. A transparent hairline above and below, and a ground clipped inside it,
	// keeps the rows where they are and the grounds a step apart.
	tight: {
		borderTopWidth: border.hairlinePx,
		borderBottomWidth: border.hairlinePx,
		borderTopStyle: 'solid',
		borderBottomStyle: 'solid',
		borderTopColor: 'transparent',
		borderBottomColor: 'transparent',
		backgroundClip: 'padding-box',
	},
	// A top-level row -- a section, Settings, the Articles folder -- reads lit at rest, and the
	// pointer adds only the ground. What sits under Articles rests soft and lifts under the
	// pointer, so the two levels are told apart by their ink before anything is touched.
	top: { color: 'var(--color-text-strong)' },
	// The section being worked in takes the pane's ground, which is what says the pane is its.
	current: {
		color: 'var(--color-text-strong)',
		backgroundColor: 'var(--color-page)',
	},
	unnamed: { color: 'var(--color-text-soft)' },
	// What the sidebar holds recedes while a drag is asking to fold it, and the notice stands
	// in front: what letting go will do, said on the region it will happen to.
	receded: { opacity: 0.25 },
	chevron: {
		transitionProperty: 'rotate',
		transitionDuration: duration.base,
		transitionTimingFunction: easing.inOut,
	},
});

export const ITEM = 'flex min-w-0 items-center gap-2 px-2 py-1.5 no-underline';
// The article tree is denser than the sections above it: it is a long list read by scanning,
// where the sections are a handful of places to go.
// One pixel of the vertical room is a transparent edge the ground stops short of: see `tight`.
export const TREE_ITEM = 'flex min-w-0 items-center gap-2 px-2 py-0.75 no-underline';

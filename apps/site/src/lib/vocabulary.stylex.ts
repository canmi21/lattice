/**
 * The values the visual layer repeats, each with one name, already written character for
 * character by three or more components -- a value only two share stays a literal. Two spellings
 * of one idea keep two names: they part company outside the default root size. See spec/todo.md.
 *
 * `defineConsts`, never `defineVars`: a var group rewrites every reading declaration into a
 * `var()`, where a const inlines and leaves the declaration as written; only the hashed class
 * name changes. See spec/architecture/css.md.
 *
 * The `.stylex`/`.stylex.const` filename is the compiler's own requirement (`vite.config.ts`
 * states the alias), and a key not defined here is not an error here: the importing file gets a
 * proxy resolving any string, so a typo becomes a `var()` nothing declares and the browser drops
 * silently -- only `tsc` catches it.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Tailwind's radius scale, which is where all five of these came from -- `--radius-sm` through
 * `--radius-xl`, and `rounded-full`. `624.9375rem` is the site's other pill and is deliberately
 * not here: it computes to a different number and it is the one value on the site that loses a
 * digit in serialisation. See spec/todo.md.
 */
export const radius = stylex.defineConsts({
	sm: '0.25rem',
	md: '0.375rem',
	lg: '0.5rem',
	xl: '0.75rem',
	full: 'calc(infinity * 1px)',
});

/**
 * The type ladder, named by its size in pixels at the default root.
 *
 * Six steps, one pixel apart, and only two of them are Tailwind's -- `text-xs` is `px12` and
 * `text-sm` is `px14`. A t-shirt ladder would therefore have had to give those two letters
 * meanings that disagree with the utilities the components' own comments still cite, so the
 * figure is the name and the unit stays `rem`.
 */
export const text = stylex.defineConsts({
	px10: '0.625rem',
	px11: '0.6875rem',
	px12: '0.75rem',
	px13: '0.8125rem',
	px14: '0.875rem',
	px15: '0.9375rem',
});

/**
 * Line heights written as a ratio, both of them Tailwind's. The site's third repeated ratio,
 * 1.4, is not named: it belongs to no scale and nothing records why it is 1.4. See spec/todo.md.
 */
export const line = stylex.defineConsts({
	snug: 1.375,
	relaxed: 1.625,
});

/**
 * A line height written as a length, which is a different kind of thing from the ratios above
 * and is named apart from them for that reason.
 *
 * Every one of its six sites sits directly under `text.px14`, because it is the line that step
 * computes to and the ratio that would say so, `calc(1.25 / 0.875)`, does not terminate. So the
 * name is the length, on the same footing as the type ladder. See spec/architecture/css.md.
 */
export const leading = stylex.defineConsts({
	px20: '1.25rem',
});

/** `font-medium`, and the site's own step above it that no utility writes. */
export const weight = stylex.defineConsts({
	medium: 500,
	strong: 560,
});

/**
 * Border widths, and the two hairlines are two names on purpose.
 *
 * They are the same length at the default root size and at no other, so a reader who enlarges
 * text sees them part company. Which one a hairline should be is a real question and it is not
 * answered here. See spec/todo.md.
 */
export const border = stylex.defineConsts({
	hairlinePx: '1px',
	hairlineRem: '0.0625rem',
	doublePx: '2px',
});

/** `duration-200`. No other duration on the site repeats across three components. */
export const duration = stylex.defineConsts({
	base: '200ms',
});

/** Tailwind's `--ease-in-out`, which is also the curve its transition utilities default to. */
export const easing = stylex.defineConsts({
	inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
});

/**
 * What `transition-colors` compiles to, which is the longest string the site retypes.
 *
 * Three of the ten are Tailwind's private gradient variables and this site sets none of them.
 * They stay because the measure of a migration is the computed value, and whether they belong in
 * our source at all is a question one name does not answer -- it only gives it one place to be
 * answered in. See spec/todo.md.
 */
export const transition = stylex.defineConsts({
	colors:
		'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to',
});

/**
 * The two monospace stacks, which are not the same stack.
 *
 * Tailwind's theme variable carries Monaco, Liberation Mono and Courier New; the spelled-out one
 * does not, so a machine with Monaco and without Menlo renders two different fonts on one page.
 * Which is right is a question about the fonts rather than about the layering. See spec/todo.md.
 */
export const family = stylex.defineConsts({
	monoTheme: 'var(--font-mono)',
	monoSpelled: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
});

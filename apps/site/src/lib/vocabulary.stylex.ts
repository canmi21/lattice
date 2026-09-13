import * as stylex from '@stylexjs/stylex';

/**
 * The values the visual layer repeats, each with one name.
 *
 * Only what three or more components already wrote character for character is here. A value two
 * components share stays a literal in both: a name used twice is a name two people have to learn
 * for nothing. Nothing in this file is a new value, a rounded value or a merged one -- where the
 * site has two spellings of one idea it has two names below, because the spellings are not the
 * same length at every root size and choosing between them is not a rename. See spec/todo.md.
 *
 * **`defineConsts`, never `defineVars`.** A var group emits a custom property and rewrites every
 * declaration reading it into a `var()`, which changes the stylesheet; a const is inlined and the
 * declaration comes back the same. What does change is the class name, because StyleX hashes it
 * from the declaration as written -- `font-size:var(--<consthash>)` rather than the literal -- and
 * substitutes the value afterwards. See spec/architecture/css.md.
 *
 * **The filename is the compiler's, not this repository's.** `defineConsts` refuses to hash a
 * module whose name does not end `.stylex` or `.stylex.const`, and an import written any other
 * way is not resolved at all -- which is why the alias is stated in `vite.config.ts`.
 *
 * **A key that does not exist here is not an error there.** The importing file receives a proxy
 * that answers any string, so a typo compiles to a `var()` nothing declares and the browser drops
 * the declaration without a word from the compiler or the console. `tsc` is the only thing that
 * catches it.
 */

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

/**
 * The values the panel's visual layer repeats, each with one name, as the site's
 * libs/tokens/src/vocabulary.stylex.ts names its own. `defineConsts`, so a declaration reads as
 * written. The `.stylex` in the file name is the compiler's requirement.
 */
import * as stylex from '@stylexjs/stylex';

export const radius = stylex.defineConsts({
	sm: '0.25rem',
	md: '0.375rem',
	lg: '0.5rem',
	xl: '0.75rem',
	full: 'calc(infinity * 1px)',
});

/** The type ladder, named by its size in pixels at the default root. */
export const text = stylex.defineConsts({
	px11: '0.6875rem',
	px12: '0.75rem',
	px13: '0.8125rem',
	px14: '0.875rem',
	px16: '1rem',
	px20: '1.25rem',
	px28: '1.75rem',
});

export const weight = stylex.defineConsts({
	normal: '400',
	medium: '500',
	semibold: '600',
});

export const font = stylex.defineConsts({
	sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
	mono: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
});

/** How fast a color answers a pointer: quicker than anything that travels. */
export const duration = stylex.defineConsts({
	hover: '120ms',
});

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { ARTICLE_COLUMN, FOLD_BELOW, PANE_MIN, SIDEBAR, sidebarStyles } from './sidebar.ts';

// A media query cannot read `--rail-column`, so the fold restates it; this is what keeps the
// restatement honest when the site's column changes.
it('restates the site article column the fold is computed from', () => {
	const rail = readFileSync(
		new URL('../../../../libs/prose/src/rail.css', import.meta.url),
		'utf8',
	);
	expect(rail).toMatch(new RegExp(`--rail-column:\\s*${ARTICLE_COLUMN}rem;`));
});

it('folds exactly where both regions stop fitting at their minimums', () => {
	expect(FOLD_BELOW).toBe(1.5 + SIDEBAR.span.min + PANE_MIN);
	expect(sidebarStyles()).toContain(`@media (max-width: ${FOLD_BELOW}rem)`);
});

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { reader, type Store } from '@canmi/behavior/state';
import {
	ARTICLE_COLUMN,
	FOLD_BELOW,
	FOLDED_ATTRIBUTE,
	FOLDED_KEY,
	foldedScript,
	PANE_MIN,
	SIDEBAR,
	sidebarStyles,
} from './sidebar.ts';

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

// The script reads the record before any module loads; this holds it to what `reader` writes.
it('marks the root before the first frame exactly when the fold was remembered', () => {
	const items = new Map<string, string>();
	const store: Store = {
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value),
	};
	const run = () => {
		const set: string[] = [];
		const document = { documentElement: { setAttribute: (name: string) => set.push(name) } };
		new Function('localStorage', 'document', foldedScript())(store, document);
		return set;
	};
	expect(run()).toEqual([]);
	reader.remember(store, FOLDED_KEY, true);
	expect(run()).toEqual([FOLDED_ATTRIBUTE]);
	reader.remember(store, FOLDED_KEY, false);
	expect(run()).toEqual([]);
});

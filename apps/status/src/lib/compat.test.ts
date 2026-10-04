import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/** An app's syntax floor, as its package.json states it; see spec/compat.md. */
const floorOf = (app: string): string[] =>
	JSON.parse(
		readFileSync(fileURLToPath(new URL(`../../../${app}/package.json`, import.meta.url)), 'utf8'),
	).browserslist;

it('gives the status page the same floor as the site', () => {
	expect(floorOf('status')).toEqual(floorOf('site'));
});

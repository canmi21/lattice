import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { esbuildTarget } from './build';

const floorOf = (app: string): string[] =>
	JSON.parse(
		readFileSync(
			fileURLToPath(new URL(`../../../apps/${app}/package.json`, import.meta.url)),
			'utf8',
		),
	).browserslist;

it('spells each floor the way esbuild does', () => {
	expect(esbuildTarget(['chrome >= 110', 'safari >= 16.0'])).toEqual(['chrome110', 'safari16.0']);
});

it('refuses a query that is not a floor', () => {
	expect(() => esbuildTarget(['last 2 versions'])).toThrow(/not a floor/);
});

it('gives the site and the status page the same floor', () => {
	expect(floorOf('status')).toEqual(floorOf('site'));
});

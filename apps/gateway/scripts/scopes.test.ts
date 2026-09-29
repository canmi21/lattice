import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderScopes, scopeTable } from '../src/table.ts';
import { declarations, formatted, stale } from './scopes.ts';

const SCOPES = join(import.meta.dirname, '../src/scopes.ts');

describe('the generated table stays truthful without being rewritten', () => {
	it('is not stale against the committed file', () => {
		expect(stale()).toBe(false);
	});

	it('formats a raw render the way oxfmt would leave the committed file', () => {
		const raw = renderScopes(scopeTable(declarations()));
		expect(formatted(raw)).toBe(readFileSync(SCOPES, 'utf8'));
	});

	it('disagrees once a declaration is added and the committed file is not regenerated', () => {
		const committed = readFileSync(SCOPES, 'utf8');
		const table = scopeTable([
			...declarations(),
			'version = 1\nname = "extra"\nplacements = ["home"]\n[api]\npublic = true\n',
		]);
		expect(formatted(renderScopes(table))).not.toBe(committed);
	});

	it('never writes to the committed file', () => {
		const before = readFileSync(SCOPES, 'utf8');
		stale();
		expect(readFileSync(SCOPES, 'utf8')).toBe(before);
	});
});

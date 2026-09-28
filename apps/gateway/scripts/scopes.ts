import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderScopes, scopeTable } from '../src/table.ts';

const APPS = join(import.meta.dirname, '../..');

/** Every app's declaration, as text. Shared with the test that holds the committed table to it. */
export function declarations(): string[] {
	return readdirSync(APPS).flatMap((app) => {
		try {
			return [readFileSync(join(APPS, app, 'service.toml'), 'utf8')];
		} catch {
			return [];
		}
	});
}

if (import.meta.main) {
	const table = renderScopes(scopeTable(declarations()));
	writeFileSync(join(import.meta.dirname, '../src/scopes.ts'), table);
}

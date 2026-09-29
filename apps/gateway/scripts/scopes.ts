import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderScopes, scopeTable } from '../src/table.ts';

const APPS = join(import.meta.dirname, '../..');
const ROOT = join(import.meta.dirname, '../../..');
const SCOPES = join(import.meta.dirname, '../src/scopes.ts');

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

/**
 * `source` as oxfmt would leave it. Written beside the real file, under the name `mise run
 * scopes` never uses, so the same config oxfmt would find for `scopes.ts` applies here too;
 * removed again whether formatting succeeds or throws.
 */
export function formatted(source: string): string {
	const scratch = join(import.meta.dirname, '../src/scopes.check.ts');
	writeFileSync(scratch, source);
	try {
		execFileSync('pnpm', ['exec', 'oxfmt', scratch], { cwd: ROOT, stdio: 'pipe' });
		return readFileSync(scratch, 'utf8');
	} finally {
		rmSync(scratch);
	}
}

/**
 * Whether the committed `src/scopes.ts` disagrees with every `service.toml`, formatting
 * included, without ever writing to it. See spec/architecture/services.md, "One API host, scoped
 * by path".
 */
export function stale(): boolean {
	const table = renderScopes(scopeTable(declarations()));
	return formatted(table) !== readFileSync(SCOPES, 'utf8');
}

if (import.meta.main) {
	if (process.argv.includes('--check')) {
		if (stale()) {
			console.error('apps/gateway/src/scopes.ts is stale; run `mise run scopes`');
			process.exit(1);
		}
	} else {
		writeFileSync(SCOPES, renderScopes(scopeTable(declarations())));
	}
}

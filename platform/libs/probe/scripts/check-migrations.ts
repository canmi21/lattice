/**
 * Fails when `schema.ts` and the committed migrations under `../migrations` disagree.
 *
 * `drizzle-kit generate` is idempotent when nothing changed -- it prints "No schema changes" and
 * touches nothing -- so this runs it in place, over the real directory, and fails loudly if a new
 * file appears; the run is undone either way so the tree is never left dirty by a check.
 * See spec/architecture/probe.md, "The schema: declared once, in Drizzle, applied by the probe".
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS = join(PACKAGE_ROOT, 'migrations');

function filesUnder(directory: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const full = join(directory, entry.name);
		if (entry.isDirectory()) found.push(...filesUnder(full));
		else found.push(full);
	}
	return found;
}

function snapshot(): Map<string, Buffer> {
	const before = new Map<string, Buffer>();
	for (const file of filesUnder(MIGRATIONS)) {
		before.set(relative(MIGRATIONS, file), readFileSync(file));
	}
	return before;
}

const before = snapshot();
execFileSync('pnpm', ['exec', 'drizzle-kit', 'generate'], {
	cwd: PACKAGE_ROOT,
	stdio: 'inherit',
});
const after = snapshot();

const added = [...after.keys()].filter((path) => !before.has(path));
const changed = [...after.keys()].filter(
	(path) => before.has(path) && !after.get(path)!.equals(before.get(path)!),
);
const removed = [...before.keys()].filter((path) => !after.has(path));

// Undo the run so the check never leaves the tree dirty, drift or not.
for (const path of added) rmSync(join(MIGRATIONS, path));
for (const path of [...changed, ...removed]) {
	const original = before.get(path);
	if (original) writeFileSync(join(MIGRATIONS, path), original);
}

if (added.length > 0 || changed.length > 0 || removed.length > 0) {
	console.error('schema.ts and the committed migrations disagree:');
	for (const path of added) console.error(`  missing: ${path}`);
	for (const path of changed) console.error(`  stale:   ${path}`);
	for (const path of removed) console.error(`  extra:   ${path}`);
	console.error('run `pnpm --filter @monoflake/probe run database:generate` and commit it.');
	process.exit(1);
}

if (!existsSync(MIGRATIONS)) throw new Error('migrations directory vanished during the check');

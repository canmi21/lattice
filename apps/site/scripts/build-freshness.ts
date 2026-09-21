/**
 * Refuse to answer from a build older than the source it came from.
 *
 * Both checks beside this file read what the site's build wrote, and `wait_for` orders them
 * behind it only when they run together -- alone, nothing makes one. Reporting an old build's
 * answer as today's is worse than reporting none, so they ask here first. Shared rather than
 * copied because there is one answer to "is this output current", and two of it would drift
 * the moment one side learned about a directory the other did not.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('..', import.meta.url));
const ROOT = join(SITE, '../..');
const OUTPUT = join(SITE, '.svelte-kit/output');
// The adapter rewrites this on every build, so its time is the build's time. Picked over the
// directory, whose own mtime says only when something inside it was last added or removed.
const MANIFEST = join(OUTPUT, 'server/manifest.js');

// Generated or installed, and never the reason the output is out of date.
const SKIP = new Set(['node_modules', 'paraglide', 'dist', 'target']);

/**
 * The trees that can move what these checks measure, and which files in each can.
 *
 * libs/ is watched through its CSS alone, because that is how it reaches the site: `0.*.css` is
 * assembled by `@import` from tokens, primitives and fonts, and is most of every figure. Walking
 * the rest of libs/ would fail a gate on a change that cannot move what it measures, and a gate
 * people satisfy by reflex has stopped being read. The narrow list is the coverage, not a
 * compromise on it.
 */
const TREES: { dir: string; only?: RegExp }[] = [
	{ dir: join(SITE, 'src') },
	{ dir: join(ROOT, 'libs'), only: /\.css$/ },
];

/** The configs that decide how those sheets are compiled, layered and split per route. */
const FILES = [join(SITE, 'vite.config.ts'), join(SITE, 'svelte.config.js')];

/**
 * What to print when the build is not the one this tree produces, or nothing when it is.
 *
 * Still outside it: a change under libs/ that reaches a sheet as TypeScript rather than as CSS,
 * by a path neither reader of this has found. That one is measured a build late.
 */
export function staleBuild(): string | undefined {
	let at: number;
	try {
		at = statSync(MANIFEST).mtimeMs;
	} catch {
		return `no build under ${OUTPUT}. Build the site first.`;
	}

	let newest: string | undefined;
	const note = (path: string) => {
		const { mtimeMs } = statSync(path);
		if (mtimeMs <= at) return;
		at = mtimeMs;
		newest = path;
	};
	const walk = (dir: string, only?: RegExp) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (SKIP.has(entry.name)) continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path, only);
			else if (only === undefined || only.test(entry.name)) note(path);
		}
	};

	for (const tree of TREES) walk(tree.dir, tree.only);
	for (const path of FILES) note(path);

	if (newest === undefined) return undefined;
	return (
		`${relative(ROOT, newest)} is newer than the build under ${OUTPUT}, so this is not the ` +
		'output this tree produces. Run `mise run check-css` to rebuild, then this again.'
	);
}

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

/**
 * A local D1 with this worker's migrations applied, for a test that needs one.
 *
 * Not named `.test.ts`, so vitest does not collect it as a suite, and in `src/` so the workers
 * program type checks it against the same globals the code it supports runs under. Two suites
 * wanted this and a second copy of a fixture is a second thing to keep in step.
 *
 * The miniflare version is not a choice made here: wrangler depends on it, so pnpm resolves one
 * copy and this runs the same runtime `wrangler dev` does.
 */
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url).href);

export type LocalDatabase = {
	miniflare: Miniflare;
	database: Awaited<ReturnType<Miniflare['getD1Database']>>;
};

export async function standUpDatabase(): Promise<LocalDatabase> {
	// Miniflare 5 replaced the flat options object with one that mirrors wrangler's config, and
	// ships `convertV4MiniflareOptions` to bridge the two. Taken rather than rewritten by hand:
	// this wants a D1 and nothing else, and the new shape carries a worker config whose every
	// other field would be noise here.
	const miniflare = new Miniflare(
		convertV4MiniflareOptions({
			compatibilityDate: '2026-07-29',
			modules: true,
			script: 'export default { fetch() { return new Response("unused") } }',
			d1Databases: ['DATABASE'],
		}),
	);
	const database = await miniflare.getD1Database('DATABASE');
	const names = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql')).toSorted();
	const migrations = await Promise.all(
		names.map((name) => readFile(`${MIGRATIONS}/${name}`, 'utf8')),
	);
	for (const sql of migrations) {
		for (const statement of sql.split('--> statement-breakpoint')) {
			// oxlint-disable-next-line no-await-in-loop -- later statements depend on earlier DDL
			if (statement.trim()) await database.prepare(statement).run();
		}
	}
	return { miniflare, database };
}

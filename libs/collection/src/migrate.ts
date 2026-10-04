/**
 * Bring both files up to the schema in this package, and say what it did.
 *
 * Creating the directory is part of it: the collection is not in git, so a fresh clone has no
 * `data/collection` to open a file in. Migrating is the only way either file is ever changed --
 * a hand-altered database is one nothing can migrate afterwards.
 */
import { migrate as apply } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DERIVED_FILE, openDerived, openSource, SOURCE_FILE } from './open.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

export function migrateCollection(repository: string): { source: string; derived: string } {
	const source = resolve(repository, SOURCE_FILE);
	const derived = resolve(repository, DERIVED_FILE);
	mkdirSync(dirname(source), { recursive: true });
	apply(openSource(source), { migrationsFolder: resolve(HERE, '../drizzle/source') });
	apply(openDerived(derived), { migrationsFolder: resolve(HERE, '../drizzle/derived') });
	return { source, derived };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const repository = resolve(HERE, '../../..');
	const { source, derived } = migrateCollection(repository);
	console.log(`collection migrated: ${source}, ${derived}`);
}

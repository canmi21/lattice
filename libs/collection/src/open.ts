/**
 * Where the driver is named, and the only place it is.
 *
 * Queries elsewhere take a database and never import one, because the same schema runs over a
 * file here and over D1 when the surface goes online -- a driver welded into a query is what
 * would make that move a rewrite. This module is the exception that keeps the rule affordable.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as derived from './derived.ts';
import * as source from './source.ts';

/** Where the two files live, relative to a repository root. */
export const SOURCE_FILE = 'data/collection/source.sqlite';
export const DERIVED_FILE = 'data/collection/derived.sqlite';

/**
 * Open a file, with foreign keys on.
 *
 * SQLite disables them by default and every driver inherits that, so the references this schema
 * declares are decoration until this pragma runs -- a row pointing at a resource that was never
 * inserted is accepted in silence otherwise. WAL because two processes read while one writes.
 */
function open(file: string) {
	const database = new Database(file);
	database.pragma('foreign_keys = ON');
	database.pragma('journal_mode = WAL');
	return database;
}

export function openSource(file: string) {
	return drizzle(open(file), { schema: source });
}

export function openDerived(file: string) {
	return drizzle(open(file), { schema: derived });
}

export type SourceDatabase = ReturnType<typeof openSource>;
export type DerivedDatabase = ReturnType<typeof openDerived>;

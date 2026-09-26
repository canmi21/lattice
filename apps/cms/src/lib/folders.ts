/**
 * Which folders of the article tree the writer left closed, kept in the `reader` record so a
 * reload opens the tree the way it was left: the Articles folder itself, and each category by its
 * name. A category that no longer exists is dropped the next time the set is written, so the
 * record holds only names the tree still has. See spec/architecture/local.md.
 */
import { reader, type Store } from '@canmi/behavior/state';

/** Whether the Articles folder is open. */
export const ARTICLES_OPEN_KEY = 'cms.articles.open';

/** The categories closed, by name; each is open until then. */
export const CLOSED_KEY = 'cms.articles.closed';

export type Folders = { open: boolean; closed: string[] };

export function recallFolders(storage: Store): Folders {
	const closed = reader.recall<string[]>(storage, CLOSED_KEY, []);
	return {
		open: reader.recall(storage, ARTICLES_OPEN_KEY, true),
		closed: closed.filter((name) => typeof name === 'string'),
	};
}

/** Kept as the tree has them, less the names of categories it no longer has. */
export function rememberFolders(storage: Store, folders: Folders, present: Iterable<string>) {
	const names = new Set(present);
	reader.remember(storage, ARTICLES_OPEN_KEY, folders.open);
	reader.remember(storage, CLOSED_KEY, folders.closed.filter((name) => names.has(name)).toSorted());
}

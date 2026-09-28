import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * The records tree on this machine, as the fetcher the store reads it through in development.
 *
 * `vite dev` runs in node, so the tree is read off the disk here; `wrangler dev` could hand it over
 * as assets, but the site's assets are its own build. Imported only in development, so node's
 * filesystem never reaches the Worker. See spec/architecture/data.md, "Where bytes and records
 * live".
 */
const TREE = fileURLToPath(new URL('../../../../../data/bucket/metadata/', import.meta.url));

export const localRecords = {
	async fetch(input: string | URL | Request): Promise<Response> {
		const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
		const key = decodeURIComponent(url.pathname.slice(1));
		// A key is a path inside the tree, never one that climbs out of it.
		if (key.split('/').some((part) => part === '..' || part === '')) {
			return new Response(null, { status: 404 });
		}
		try {
			return new Response(await readFile(`${TREE}${key}`));
		} catch {
			return new Response(null, { status: 404 });
		}
	},
};

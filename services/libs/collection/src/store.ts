/**
 * The collection's own bytes, addressed by cid, and the second place a driver is named.
 *
 * `contents` records that a run of bytes exists and what is known about it; it does not hold the
 * bytes, because a row per 200MB original is not a database. So the two halves of a content live
 * apart, and this is the half a filesystem answers. Everything above takes the interface, for the
 * same reason queries take a database and never open one -- see open.ts.
 *
 * Not `data/bucket/objects`. That tree is what publication emitted: compiled, derived, and
 * reproducible from what is here. This one is authored input, and losing it is not a rebuild.
 */
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Where the collection's bytes live, relative to a repository root. */
export const OBJECTS_DIR = 'data/collection/objects';

/**
 * The address itself: BLAKE3 truncated to 128 bits, the digest everything else here already uses.
 *
 * The same function as `.mise/tasks/content-id.mjs` and as `storageKey`'s argument, so a text
 * published from the collection lands on the key the site was going to ask for anyway.
 */
export function contentId(text: string): string {
	return bytesToHex(blake3(new TextEncoder().encode(text), { dkLen: 16 }));
}

/**
 * Reading and writing bytes by cid, which is all anything above here needs to know.
 *
 * Async on both sides though the implementation below is synchronous: the same calls go to R2
 * when the collection moves off this machine, and a signature that changes then is a signature
 * every caller is rewritten for.
 */
export type ContentStore = {
	read(cid: string): Promise<string>;
	write(cid: string, text: string): Promise<void>;
	/** Take the bytes. Absent is success: a sweep that runs twice must not fail the second time. */
	forget(cid: string): Promise<void>;
};

/**
 * Sharded two levels, which is `storageKey`'s shape without its extension.
 *
 * No extension on purpose: the mime is a column in `contents`, and a filename repeating it is
 * that fact written twice, in the copy nothing validates.
 */
function pathFor(root: string, cid: string): string {
	return join(root, cid.slice(0, 2), cid.slice(2, 4), cid);
}

/** The collection's bytes on this machine, under one directory. */
export function fileStore(root: string): ContentStore {
	return {
		read(cid) {
			return Promise.resolve(readFileSync(pathFor(root, cid), 'utf8'));
		},
		write(cid, text) {
			const file = pathFor(root, cid);
			mkdirSync(dirname(file), { recursive: true });
			// Bytes are what their cid says they are, so a second write of the same cid writes the
			// same thing. Writing it anyway is cheaper than asking, and repairs a lost file.
			writeFileSync(file, text);
			return Promise.resolve();
		},
		forget(cid) {
			rmSync(pathFor(root, cid), { force: true });
			return Promise.resolve();
		},
	};
}

/** A store held in memory, for tests and for a dry run that must not touch the tree. */
export function memoryStore(held: Map<string, string> = new Map()): ContentStore {
	return {
		read(cid) {
			const text = held.get(cid);
			if (text === undefined) return Promise.reject(new Error(`no bytes stored for ${cid}`));
			return Promise.resolve(text);
		},
		write(cid, text) {
			held.set(cid, text);
			return Promise.resolve();
		},
		forget(cid) {
			held.delete(cid);
			return Promise.resolve();
		},
	};
}

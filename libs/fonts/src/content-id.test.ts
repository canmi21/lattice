import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * What a font chunk is named by, pinned to a number rather than to a library.
 *
 * The font pipeline is Python and computes its content ids by running `.mise/tasks/content-id.mjs`,
 * which is the only place in this repository that names an object from outside TypeScript. An id
 * that quietly changed -- a different library, a different truncation, a different default output
 * length -- would republish all 524 chunks under new names and leave the old ones to be swept,
 * which reads as a successful rebuild and is not one. See spec/architecture/fonts.md.
 */
const HASHER = fileURLToPath(new URL('../../../.mise/tasks/content-id.mjs', import.meta.url));

/** The helper, called the way the pipeline calls it: paths in on stdin, ids out in order. */
function contentIds(...bodies: (string | Uint8Array)[]): string[] {
	const directory = mkdtempSync(join(tmpdir(), 'content-id.'));
	const paths = bodies.map((body, index) => {
		const path = join(directory, `${index}.bin`);
		writeFileSync(path, body);
		return path;
	});
	const answer = execFileSync(process.execPath, [HASHER], {
		input: paths.join('\n'),
		encoding: 'utf8',
	});
	return answer.split('\n').filter(Boolean);
}

describe('the content id a chunk is published under', () => {
	// The first two are BLAKE3's own published test vectors for an empty input and for the single
	// byte 0x00, truncated to 128 bits: they hold this to the algorithm rather than to whatever
	// the installed library happens to compute, and they can be checked against `b3sum -l 16`.
	it('is BLAKE3 truncated to 128 bits, and these exact digits', () => {
		expect(contentIds('')).toEqual(['af1349b9f5f9a1a6a0404dea36dcc949']);
		expect(contentIds(new Uint8Array([0]))).toEqual(['2d3adedff11b61f14c886e35afa03673']);
		expect(contentIds('press font chunk')).toEqual(['72a58b979a52d03ef11c3ddf19ebf460']);
	});

	// The pipeline pairs the answers with the paths it sent by position, so a reordering here
	// would name every chunk after a different chunk's bytes and publish all of them wrongly.
	it('answers in the order it was asked, one id per path', () => {
		expect(contentIds('press font chunk', '', new Uint8Array([0]))).toEqual([
			'72a58b979a52d03ef11c3ddf19ebf460',
			'af1349b9f5f9a1a6a0404dea36dcc949',
			'2d3adedff11b61f14c886e35afa03673',
		]);
	});

	// Hashing nothing is not an error and not a hash of nothing: the pipeline asks whenever it
	// has published something, and a family with no chunks to adopt is an ordinary answer.
	it('answers nothing when it is asked nothing', () => {
		expect(contentIds()).toEqual([]);
	});
});

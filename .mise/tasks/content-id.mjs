import { readFile } from 'node:fs/promises';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// The content id of every file named on stdin, one per line, answered in the same order.
//
// Node rather than the Python pipeline that calls it: BLAKE3 is not in the standard library and
// a pure-Python one is too slow to hash the whole published set on every check. This is the same
// digest `apps/site/scripts/publish.ts` names an object by -- see libs/artifacts' `storageKey`.

const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const paths = Buffer.concat(input).toString('utf8').split('\n').filter(Boolean);

const ids = [];
for (const path of paths) {
	ids.push(bytesToHex(blake3(await readFile(path), { dkLen: 16 })));
}

process.stdout.write(ids.join('\n') + (ids.length > 0 ? '\n' : ''));

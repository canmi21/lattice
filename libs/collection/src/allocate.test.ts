/**
 * The refused stems, held to one list by reading the other one.
 *
 * Two allocators grant ids from the same space -- `apps/local/src/resource.rs` and this package --
 * and each carries the word list. A duplicated list drifts the way every duplicated list drifts,
 * and this one drifts silently: the halves can only disagree about ids nobody has been granted
 * yet, so the first evidence would be an id somebody is embarrassed by.
 *
 * A guard rather than a fix, and honest about it: the fix is one owner, which
 * spec/todo/cms.md says arrives by `local` giving up granting rather than by either side
 * generating the other. Until then this fails the moment they disagree, which is the property
 * the duplication was missing. Reading Rust from a test is the idiom `assets.test.ts` and
 * `frontmatter-keys.test.ts` already use for exactly this.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { DENIED } from './allocate.ts';

const RESOURCE_RS = fileURLToPath(new URL('../../../apps/local/src/resource.rs', import.meta.url));

/** The literal list, read out of the declaration rather than out of the whole file. */
function deniedInRust(): string[] {
	const source = readFileSync(RESOURCE_RS, 'utf8');
	const block = /const DENIED: &\[&str\] = &\[([\s\S]*?)\];/.exec(source);
	if (!block) throw new Error(`${RESOURCE_RS}: no DENIED declaration -- did it move?`);
	return [...block[1]!.matchAll(/"([a-z]+)"/g)].map((match) => match[1]!);
}

it('refuses the same stems in both languages', () => {
	// Sorted on both sides: the order is not the fact, the membership is.
	expect([...DENIED].toSorted()).toEqual(deniedInRust().toSorted());
});

it('finds a list to compare, so a silent pass cannot mean the declaration moved', () => {
	// The failure this guards against is the guard itself going quiet. A regex that stops
	// matching would otherwise compare an empty list to an empty list and say nothing.
	expect(deniedInRust().length).toBeGreaterThan(10);
});

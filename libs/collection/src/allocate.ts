/**
 * Granting an id, which is five characters of base36 and a check that nobody holds it.
 *
 * The register is the `resource` table itself: an id is taken when a row has it, so allocation
 * asks the collection rather than a list kept beside it. Collisions are avoided by asking rather
 * than by arguing about probability -- 60 million ids and a few thousand things make the odds
 * irrelevant, and the check costs one indexed lookup.
 */
import { eq } from 'drizzle-orm';
import { resources } from './source.ts';
import type { SourceDatabase } from './open.ts';

const LENGTH = 5;
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Stems refused anywhere in a candidate, because an id ends up in article source and in a URL.
 *
 * The twin of `DENIED` in `apps/local/src/resource.rs`, and exported so the test beside this file
 * can hold the two to each other. See spec/todo/cms.md for which of them should own it once
 * allocation has one home.
 */
export const DENIED = [
	'anus',
	'arse',
	'clit',
	'cock',
	'crap',
	'cunt',
	'dick',
	'fuck',
	'nazi',
	'piss',
	'porn',
	'rape',
	'shit',
	'slut',
	'suck',
	'turd',
	'twat',
	'wank',
];

function candidate(): string {
	let id = '';
	for (let index = 0; index < LENGTH; index += 1) {
		id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
	}
	return id;
}

export async function allocate(database: SourceDatabase): Promise<string> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const id = candidate();
		if (DENIED.some((stem) => id.includes(stem))) continue;
		const held = await database.select().from(resources).where(eq(resources.id, id));
		if (held.length === 0) return id;
	}
	throw new Error('could not grant an id in a hundred attempts, which means something is wrong');
}

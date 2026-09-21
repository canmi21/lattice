/**
 * Find the type ramp values that have no name, and hold them to a record listing every one.
 *
 * spec/architecture/css/authoring.md, "An unnamed ramp value is marked, so it can be counted",
 * asks an author to mark each one and a gate to count the marks. Measured on the day this was
 * written: no mark anywhere in the tree and 46 values wanting one, so counting marks would have
 * reported zero and passed. This finds the values itself, which is the half that does not depend
 * on anybody remembering, and records them one line each rather than as a total. The mark is then
 * the judgement: it says a person looked at this value and kept it, which is the thing a falling
 * number cannot tell apart from nobody having looked yet.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOMES, ROOT, literals, scan, untrusted, type Declaration } from './css-source.ts';
import { RAMP, isRampProperty, kebab, table } from './css-owners.ts';

const RECORD = fileURLToPath(new URL('css-ramp.json', import.meta.url));
const RECORDED = relative(ROOT, RECORD);
const SELF = relative(ROOT, fileURLToPath(import.meta.url));
const VOCABULARY = HOMES.values;
const TABLE = relative(ROOT, fileURLToPath(new URL('css-owners.ts', import.meta.url)));

/**
 * A value that defers rather than setting one. There is nothing here for a scale to name: the
 * declaration says to take whatever the cascade already decided.
 */
const DEFERS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'null']);

type Ledger = {
	/**
	 * Every ramp value written as a literal, one line each, spelled as `spell` below spells it.
	 * A list and not a total: the mark in the source is what says somebody looked at a value and
	 * kept it, and a number that stopped falling cannot say whether it stopped for that reason.
	 */
	values: string[];
};

/** One unnamed value: where it is written, and what it is written as. */
type Unnamed = { declaration: Declaration; raw: string };

/**
 * A value's identity across commits: where it is written and what it says, with no line number.
 *
 * A line moves whenever anything above it is edited, so keying on one would churn the record on
 * every unrelated change. The block name and the selectors it is nested under are in because a
 * file may write one ramp property several times, once per state.
 */
function spell(each: Unnamed): string {
	const within = each.declaration.within.map((one) => ` ${one}`).join('');
	const at = `${each.declaration.block}${within}.${kebab(each.declaration.property)}`;
	return `${each.declaration.file}  ${at} = ${each.raw}`;
}

/** What is printed about one value wherever it is listed: its line, and whether it is judged. */
function line(each: Unnamed): string {
	return `    ${spell(each)}${each.declaration.marked ? '   // unnamed' : ''}`;
}

/** How many of each line something holds, so a value written twice is not read as written once. */
function tally(lines: string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const one of lines) counts.set(one, (counts.get(one) ?? 0) + 1);
	return counts;
}

/** Whether a literal is a value a scale could hold, rather than a deferral or a token read. */
function wantsName(raw: string): boolean {
	const value = raw.replace(/^['"]|['"]$/g, '').trim();
	// A `var()` is already a name: it reads the custom property libs/tokens declares.
	return !DEFERS.has(value) && !value.startsWith('var(');
}

/** A count and its noun, so a gate reporting one of something does not report '1 values'. */
function many(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** What the reader does about a value the record has never seen: name it, or list it. */
function unlisted(found: Unnamed[]): string {
	return [
		`${RECORDED} does not list ${many(found.length, 'type ramp value')} written as a literal:`,
		...found.map(line),
		`  Give one a name in ${VOCABULARY} and read it`,
		`  here, or add its line to 'values' in ${RECORDED}:`,
		...found.map((each) => `\t\t"${spell(each)}",`),
		'  Red here is the list working rather than a fault in it: either this value is new, or',
		'  the tree has moved since the list was written. Both take the same repair -- paste the',
		'  line above. Listing a value records that it exists, not that it is settled: write the',
		'  mark, `// unnamed: why`, beside the declaration to say somebody looked at it and kept',
		'  it, which is what this gate counts as judged. See spec/architecture/css/authoring.md.',
	].join('\n');
}

/** What the reader does about a line the source no longer writes. */
function gone(lines: string[]): string {
	return [
		`${RECORDED} lists ${many(lines.length, 'type ramp value')} the source no longer writes:`,
		...lines.map((one) => `    ${one}`),
		'  The value was named, moved or rewritten. Delete the line from',
		`  'values' in ${RECORDED} -- a record listing a value that is`,
		'  gone carries a debt nobody owes any more, and the judged and unjudged figures this',
		'  gate prints are both taken over that list.',
	].join('\n');
}

/**
 * The record, or the reasons it could not be read.
 *
 * A file a person edits is input, and a gate that cannot read its input has to say so: a cast
 * over a malformed record would call every value unlisted and bury the one line saying why.
 */
function ledger(): { values: string[]; broken: string[] } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(RECORD, 'utf8'));
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		return {
			values: [],
			broken: [`${RECORDED} is not JSON: ${why}. This gate reports nothing until it parses.`],
		};
	}
	const values: unknown = (parsed as Partial<Ledger>).values;
	if (!Array.isArray(values) || values.some((one) => typeof one !== 'string')) {
		return {
			values: [],
			broken: [
				`${RECORDED} holds no 'values' array of lines. It is the list of type ramp values ` +
					'written as a literal, one line each, in the spelling this gate prints.',
			],
		};
	}
	return { values: values as string[], broken: [] };
}

function main(): number {
	const owners = table();
	const found = scan();
	if (found.files === 0) {
		console.error(`read no source under apps/site/src. Fix the scan in ${SELF}.`);
		return 1;
	}
	const blind = untrusted(found.unreadable);
	if (blind.length > 0) {
		for (const each of blind) console.error(each);
		return 1;
	}

	const failures: string[] = [];
	// The ramp's own home. A ramp property the table stopped giving to the vocabulary would leave
	// this gate looking for values in a layer that no longer holds them.
	for (const property of RAMP) {
		if (owners.get(property)?.layer !== 'vocabulary') {
			failures.push(
				`the enumeration no longer gives '${property}' to the vocabulary and still lists it ` +
					`in the type ramp. Both are ${TABLE}, and the two halves of it disagree.`,
			);
		}
	}

	const unnamed: Unnamed[] = [];
	for (const block of found.blocks) {
		for (const declaration of block.declarations) {
			// The vocabulary's own module is where a ramp value is supposed to be a literal: that
			// is what naming one means.
			if (declaration.file === VOCABULARY) continue;
			if (!isRampProperty(declaration.property, owners)) continue;
			for (const raw of literals(declaration.value)) {
				if (wantsName(raw)) unnamed.push({ declaration, raw });
			}
		}
	}

	const record = ledger();
	failures.push(...record.broken);
	// Counted rather than set-differenced: one declaration written under two conditions can spell
	// the same value twice, and a record holding it once is short by one rather than complete.
	const short = tally(unnamed.map(spell));
	for (const [one, count] of tally(record.values)) short.set(one, (short.get(one) ?? 0) - count);
	if (record.broken.length === 0) {
		const missing = unnamed.filter((each) => {
			const left = short.get(spell(each)) ?? 0;
			if (left <= 0) return false;
			short.set(spell(each), left - 1);
			return true;
		});
		const stale: string[] = [];
		for (const [one, count] of short) for (let at = count; at < 0; at += 1) stale.push(one);
		if (missing.length > 0) failures.push(unlisted(missing));
		if (stale.length > 0) failures.push(gone(stale.toSorted()));
	}

	if (failures.length > 0) {
		for (const each of failures) console.error(each);
		return 1;
	}
	const marked = unnamed.filter((each) => each.declaration.marked).length;
	console.log(
		`${unnamed.length} type ramp values carry no name, each one listed in ${RECORDED} -- ` +
			`${marked} marked as judged and kept, ${unnamed.length - marked} not yet looked at; ` +
			'spec/architecture/css/authoring.md',
	);
	return 0;
}

process.exit(main());

/**
 * Find the type ramp values that have no name, and hold their number to a record that may fall.
 *
 * spec/architecture/css/authoring.md, "An unnamed ramp value is marked, so it can be counted",
 * asks an author to mark each one and a gate to count the marks. Measured on the day this was
 * written: no mark anywhere in the tree and 46 values wanting one, so counting marks would have
 * reported zero and passed. This finds the values instead, which is the half that does not depend
 * on anybody remembering. A mark still says something -- that a person looked and decided not to
 * name it -- and is reported beside the total rather than subtracted from it.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOMES, ROOT, literals, scan, untrusted, type Declaration } from './css-source.ts';
import { RAMP, kebab, owner, table } from './css-owners.ts';

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
	/** Ramp values written as a literal. A debt, not a target: the only direction is down. */
	unnamed: number;
};

/** One unnamed value: where it is written, and what it is written as. */
type Unnamed = { declaration: Declaration; raw: string };

/** Whether a literal is a value a scale could hold, rather than a deferral or a token read. */
function wantsName(raw: string): boolean {
	const value = raw.replace(/^['"]|['"]$/g, '').trim();
	// A `var()` is already a name: it reads the custom property libs/tokens declares.
	return !DEFERS.has(value) && !value.startsWith('var(');
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
		for (const line of blind) console.error(line);
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
			const says = owner(declaration.property, owners);
			if (says === undefined || !RAMP.includes(says.via)) continue;
			for (const raw of literals(declaration.value)) {
				if (wantsName(raw)) unnamed.push({ declaration, raw });
			}
		}
	}

	const record = JSON.parse(readFileSync(RECORD, 'utf8')) as Ledger;
	if (unnamed.length !== record.unnamed) {
		failures.push(
			[
				`${unnamed.length} type ramp values are written as a literal, and ${RECORDED} records ` +
					`${record.unnamed}:`,
				...unnamed.map(
					(each) =>
						`    ${each.declaration.file}:${each.declaration.line}  ` +
						`${each.declaration.block}.${kebab(each.declaration.property)} = ${each.raw}` +
						`${each.declaration.marked ? '   // unnamed' : ''}`,
				),
				`  Give one a name in ${VOCABULARY} and read it here, then lower 'unnamed' in`,
				`  ${RECORDED} to match. The recorded number is a debt and not a target: a value the`,
				'  ladder does not name is vocabulary nobody has named yet -- spec/architecture/css/',
				'  layers.md, "The type ramp is vocabulary by property, and takes its value from a token".',
			].join('\n'),
		);
	}

	if (failures.length > 0) {
		for (const line of failures) console.error(line);
		return 1;
	}
	const marked = unnamed.filter((each) => each.declaration.marked).length;
	console.log(
		`${unnamed.length} type ramp values carry no name, which is the debt ${RECORDED} records; ` +
			`${marked} of them are marked as judged -- spec/architecture/css/authoring.md`,
	);
	return 0;
}

process.exit(main());

/**
 * Hold the visual layer to the enumeration: every declaration in StyleX is one the table gives it.
 *
 * spec/architecture/css/layers.md, "The enumeration is the rule, and the test is only how the
 * enumeration grows", makes the property list the thing that decides -- on the argument that a
 * lookup can be checked by somebody who was not in the argument. Nothing was checking it, and the
 * list and the code had drifted. The table is `css-owners.ts`; this compares it against every
 * `stylex.create` block in the source rather than against the built sheets, because a failure a
 * person can act on names the file and the line. `--list` prints the table expanded.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, scan, untrusted, type Declaration } from './css-source.ts';
import { OWNS, families, isCustomProperty, kebab, owner, table } from './css-owners.ts';

const RECORD = fileURLToPath(new URL('css-enumeration.json', import.meta.url));
const RECORDED = relative(ROOT, RECORD);
const SELF = relative(ROOT, fileURLToPath(import.meta.url));
const TABLE = relative(ROOT, fileURLToPath(new URL('css-owners.ts', import.meta.url)));

type Ledger = {
	/**
	 * Frame declarations still written in the visual layer. A debt, not a target: the number is
	 * what the tree holds today and may only fall.
	 */
	frameInVocabulary: number;
	/**
	 * Properties the table does not name, each waiting on the ruling that puts it there. A list
	 * rather than a count, because each one is a question somebody has to answer.
	 */
	unnamed: string[];
};

/** Where one declaration sits, for a message somebody has to act on. */
function at(declaration: Declaration): string {
	const within = declaration.within.length > 0 ? ` ${declaration.within.join(' ')}` : '';
	return `${declaration.file}:${declaration.line}  ${declaration.block}${within}.${declaration.property}`;
}

function main(): number {
	const owners = table();
	if (process.argv.includes('--list')) {
		for (const [property, each] of [...owners].toSorted()) {
			const via = each.via === property ? '' : `  (under ${each.via})`;
			console.log(`${each.layer.padEnd(10)} ${property}${via}`);
		}
		return 0;
	}

	const found = scan();
	if (found.files === 0) {
		console.error(`read no source under apps/site/src. Fix the scan in ${SELF}.`);
		return 1;
	}
	// A block this scan skipped is a block whose declarations are charged to no layer, which is
	// the failure css-budget.ts already had once: a check that silently measures less.
	const blind = untrusted(found.unreadable);
	if (blind.length > 0) {
		for (const line of blind) console.error(line);
		return 1;
	}

	const failures: string[] = [];

	// The table's own home. A family whose entry has gone derives nothing rather than deriving
	// something wrong, so every longhand under it would read as a property nobody ever ruled on.
	for (const family of families()) {
		if (family in OWNS) continue;
		failures.push(
			`${TABLE} derives the longhands of '${family}' and no longer names the family itself. ` +
				'The derivation covers nothing, so every edge and corner under it reads as unruled.',
		);
	}

	const frame: Declaration[] = [];
	const shorthand: Declaration[] = [];
	const unnamed = new Map<string, Declaration[]>();
	let bySite = 0;
	let custom = 0;

	for (const block of found.blocks) {
		for (const declaration of block.declarations) {
			if (isCustomProperty(declaration.property)) {
				custom += 1;
				continue;
			}
			const says = owner(declaration.property, owners);
			if (says === undefined) {
				const css = kebab(declaration.property);
				unnamed.set(css, [...(unnamed.get(css) ?? []), declaration]);
				continue;
			}
			if (says.layer === 'frame') frame.push(declaration);
			else if (says.layer === 'shorthand') shorthand.push(declaration);
			else if (says.layer === 'site') bySite += 1;
		}
	}

	for (const declaration of shorthand) {
		failures.push(
			`${at(declaration)} writes a shorthand. It bundles properties the enumeration splits ` +
				'between layers, so it is written as longhands -- layers.md, "What each layer owns, by ' +
				'name". StyleX accepts the longhands only, so this one is a build error on its side.',
		);
	}

	const record = JSON.parse(readFileSync(RECORD, 'utf8')) as Ledger;
	if (frame.length !== record.frameInVocabulary) {
		failures.push(
			[
				`${frame.length} frame declarations are written in the visual layer, and ${RECORDED} ` +
					`records ${record.frameInVocabulary}:`,
				...frame.map((declaration) => `    ${at(declaration)}`),
				`  Move one to the markup, then lower 'frameInVocabulary' in ${RECORDED} to match.`,
				'  The recorded number is a debt and not a target: it is what the tree held on the day',
				'  somebody first counted, and the only direction it may move is down.',
			].join('\n'),
		);
	}

	const outstanding = new Set(record.unnamed);
	for (const [property, sites] of [...unnamed].toSorted()) {
		if (outstanding.has(property)) continue;
		failures.push(
			[
				`the enumeration names no layer for '${property}', written at:`,
				...sites.map((declaration) => `    ${at(declaration)}`),
				`  Ask the three questions in spec/architecture/css/procedure.md and write the answer`,
				`  into ${TABLE} in the same change -- layers.md, "The enumeration is the rule, and the`,
				`  test is only how the enumeration grows". Listing it under 'unnamed' in ${RECORDED}`,
				'  records that the question is open, and is a debt rather than an answer.',
			].join('\n'),
		);
	}
	for (const property of outstanding) {
		if (unnamed.has(property)) continue;
		failures.push(
			`${RECORDED} carries '${property}' as an open question and nothing in the visual layer ` +
				`writes it. Rule on it in ${TABLE} or drop it from the record; a ledger holding ` +
				'entries nobody has to act on is one nobody reads.',
		);
	}

	if (failures.length > 0) {
		for (const line of failures) console.error(line);
		return 1;
	}
	const counted = found.blocks.reduce((sum, block) => sum + block.declarations.length, 0);
	console.log(
		`${counted} declarations in the visual layer, every one of them enumerated in ${TABLE}:`,
	);
	console.log(`  frame, still to move   ${String(frame.length).padStart(4)}  (${RECORDED})`);
	console.log(`  split by site          ${String(bySite).padStart(4)}  decided at the site`);
	console.log(`  custom properties      ${String(custom).padStart(4)}  outside the table`);
	return 0;
}

process.exit(main());

/**
 * Count the components behind every name in the visual layer, and the repetitions with no name.
 *
 * The threshold in spec/architecture/css/extraction.md is three components, which is a fact about
 * the whole repository and invisible from the file being edited -- so it drifts unless something
 * recomputes it. Two halves: a name applied in fewer than three components fails outright, and a
 * group of declarations repeated across three files with no name is recorded as a candidate
 * against a baseline. See spec/architecture/css/procedure.md, "A rule that rests on a global
 * count is computed, never remembered". Reads source, so it needs no build.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOMES, ROOT, scan, untrusted, type Block, type Scan, type Value } from './css-source.ts';

const RECORD = fileURLToPath(new URL('css-extraction.json', import.meta.url));
const RECORDED = relative(ROOT, RECORD);
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

/** extraction.md's bar, for a value and for a group alike. */
const THRESHOLD = 3;

/** A read inside one of these is the declaration of a name rather than an application of it. */
const GROUPS = HOMES.groups;
const DECLARING = new Set([HOMES.values, GROUPS]);
/** The name `surfaces.ts` exports, which is how a component reaches a group. */
const SURFACES = 'surfaces';

/**
 * How many declarations a repetition needs before it is a candidate recipe.
 *
 * Two is a coincidence at this size: a colour and a type step sit together in a dozen places
 * because the site has one of each, not because anybody wrote a recipe.
 */
const MEMBERS = 3;

type Ledger = {
	/**
	 * Repeated declaration groups nobody has named. A debt, not a target: extraction.md's other
	 * clause is that the components be unrelated, and no count can tell a recipe from a copy.
	 */
	candidates: number;
};

/** One declaration, written the way two of them are compared. */
function spell(value: Value): string {
	if (value.kind === 'literal') return value.raw;
	if (value.kind === 'named') return `${value.group}.${value.key}`;
	return `{${value.branches.map(spell).join(' | ')}}`;
}

/** A block's declarations, following the groups it spreads in. */
function effective(block: Block, byName: Map<string, Block>, seen: Set<string>): string[] {
	const written = block.declarations.map((each) => `${each.property}: ${spell(each.value)}`);
	for (const spread of block.spreads) {
		if (seen.has(spread)) continue;
		seen.add(spread);
		const source = byName.get(spread);
		if (source !== undefined) written.push(...effective(source, byName, seen));
	}
	return [...new Set(written)].toSorted();
}

/**
 * The components that apply each name, counted through the surfaces that read it.
 *
 * `leading.px20` is read nowhere but inside `surfaces.uiText`, and seven components apply that
 * surface -- so the value has seven application sites, not one. Counting only direct reads would
 * report every value a surface encapsulates as below the bar, which is the opposite of what
 * encapsulating it did.
 */
function sites(found: Scan): Map<string, Set<string>> {
	const applied = new Map<string, Set<string>>();
	const add = (name: string, file: string) => {
		const already = applied.get(name) ?? new Set<string>();
		already.add(file);
		applied.set(name, already);
	};
	for (const use of found.uses) {
		if (DECLARING.has(use.file)) continue;
		add(`${use.group}.${use.key}`, use.file);
	}

	const surfaces = found.blocks.filter((block) => block.file === GROUPS);
	const byName = new Map(surfaces.map((block) => [block.name, block]));
	for (const surface of surfaces) {
		const where = applied.get(`${SURFACES}.${surface.name}`) ?? new Set<string>();
		const reached: Block[] = [surface];
		for (const spread of surface.spreads) {
			const source = byName.get(spread);
			if (source !== undefined) reached.push(source);
		}
		for (const block of reached) {
			for (const declaration of block.declarations) {
				for (const read of named(declaration.value)) {
					for (const file of where) add(read, file);
				}
			}
		}
	}
	return applied;
}

/** Every `group.key` a value reads, through whatever conditions it is written under. */
function named(value: Value): string[] {
	if (value.kind === 'named') return [`${value.group}.${value.key}`];
	if (value.kind === 'literal') return [];
	return value.branches.flatMap(named);
}

/** A repeated set of declarations that no name in the visual layer covers. */
type Candidate = { declarations: string[]; files: string[] };

/**
 * Sets of declarations three or more files write identically.
 *
 * Maximal only: a five-declaration repetition also repeats each of its subsets, and reporting
 * those as well would turn one finding into a dozen. Two blocks in one file are not a repetition
 * -- the bar counts components.
 */
function candidates(found: Scan): Candidate[] {
	const surfaces = new Map(
		found.blocks.filter((block) => block.file === GROUPS).map((block) => [block.name, block]),
	);
	const written = found.blocks
		.filter((block) => block.file !== GROUPS)
		.map((block) => ({ file: block.file, declarations: effective(block, surfaces, new Set()) }));

	const shared = new Map<string, Set<string>>();
	for (let left = 0; left < written.length; left += 1) {
		for (let right = left + 1; right < written.length; right += 1) {
			const one = written[left];
			const other = written[right];
			if (one === undefined || other === undefined || one.file === other.file) continue;
			const common = one.declarations.filter((each) => other.declarations.includes(each));
			if (common.length < MEMBERS) continue;
			const key = common.join('\n');
			const files = shared.get(key) ?? new Set<string>();
			files.add(one.file);
			files.add(other.file);
			shared.set(key, files);
		}
	}

	const all = [...shared]
		.filter(([, files]) => files.size >= THRESHOLD)
		.map(([key, files]) => ({ declarations: key.split('\n'), files: [...files].toSorted() }));
	return all.filter(
		(each) =>
			!all.some(
				(other) =>
					other !== each &&
					other.declarations.length > each.declarations.length &&
					other.files.length >= each.files.length &&
					each.declarations.every((one) => other.declarations.includes(one)),
			),
	);
}

/** What the reader does about a repetition: name it, or record that it is not a recipe. */
function report(found: Candidate[], recorded: number): string {
	const lines = found.map((each) =>
		[
			`  ${each.files.length} components write the same ${each.declarations.length} declarations:`,
			...each.declarations.map((one) => `      ${one}`),
			...each.files.map((one) => `      in ${one}`),
		].join('\n'),
	);
	return [
		`${found.length} repeated declaration groups have no name, and ${RECORDED} records ` +
			`${recorded}.`,
		...lines,
		`  Give one a key in apps/site/src/lib/surfaces.ts, or raise 'candidates' in ${RECORDED}`,
		`  to ${found.length} in a commit saying which of these are copies rather than recipes --`,
		'  extraction.md wants the three components unrelated, and no count can tell the two apart.',
	].join('\n');
}

function main(): number {
	const found = scan();
	if (found.files === 0) {
		console.error(`read no source under apps/site/src. Fix the scan in ${SELF}.`);
		return 1;
	}
	// A scan that skipped a block counts fewer application sites than exist, which is the
	// direction that makes this gate report a violation nobody can act on.
	const blind = untrusted(found.unreadable);
	if (blind.length > 0) {
		for (const line of blind) console.error(line);
		return 1;
	}

	const applied = sites(found);
	const failures: string[] = [];
	for (const group of found.groups) {
		if (!DECLARING.has(group.file)) continue;
		for (const { key, line } of group.keys) {
			const name = `${group.name}.${key}`;
			const where = applied.get(name) ?? new Set<string>();
			if (where.size >= THRESHOLD) continue;
			failures.push(
				[
					`${group.file}:${line} names '${name}', which ${where.size} components apply:`,
					...[...where].toSorted().map((file) => `    ${file}`),
					`  The bar is ${THRESHOLD} -- spec/architecture/css/extraction.md. Write it out at`,
					'  each site and delete the name, or find the third component that wanted it.',
				].join('\n'),
			);
		}
	}

	const record = JSON.parse(readFileSync(RECORD, 'utf8')) as Ledger;
	const unnamed = candidates(found);
	if (unnamed.length !== record.candidates) failures.push(report(unnamed, record.candidates));

	if (failures.length > 0) {
		for (const line of failures) console.error(line);
		return 1;
	}
	const names = found.groups.filter((group) => DECLARING.has(group.file));
	const total = names.reduce((sum, group) => sum + group.keys.length, 0);
	console.log(
		`every one of the ${total} names in the visual layer is applied in ${THRESHOLD} components ` +
			`or more; ${unnamed.length} repetitions carry no name, which is the debt ${RECORDED} records`,
	);
	return 0;
}

process.exit(main());

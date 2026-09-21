/**
 * Count the components behind every name in the visual layer, and list the repetitions with none.
 *
 * The threshold in spec/architecture/css/extraction.md is three components, which is a fact about
 * the whole repository and invisible from the file being edited -- so it drifts unless something
 * recomputes it. Two halves: a name applied in fewer than three components fails outright, and a
 * group of declarations repeated across three files with no name is listed in a record that says,
 * per group, whether anybody has judged it. See spec/architecture/css/procedure.md, "A rule that
 * rests on a global count is computed, never remembered". Reads source, so it needs no build.
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

/**
 * One entry: the components a repetition is written in, and whatever judgement was passed on it.
 *
 * The components are the key, because they are what extraction.md's second clause asks about --
 * whether these three are unrelated. See `identify` below for why the declarations are not.
 */
type Entry = {
	components: string[];
	/** Why the components are unrelated, so the repetition stays. Absent until somebody looks. */
	stays?: string;
};

type Ledger = {
	/**
	 * Every repeated declaration group nobody has named, one entry per set of components. A list
	 * and not a total: extraction.md's other clause is that the components be unrelated, so some
	 * of these are meant to stay, and no count can say whether a figure that stopped falling is
	 * finished work or work nobody has started.
	 */
	groups: Entry[];
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

/**
 * What identifies a group across commits: the components, never the declarations it shares.
 *
 * A group is found as the maximal set two components share, so naming any part of one rewrites
 * every group built on that part -- naming `colorShift` moved four of fifteen entries and emptied
 * a fifth. Keying on the declarations would make all four look new and lose their judgements. The
 * components survive that, and are what the judgement is about. Two groups over the same
 * components therefore share one entry: the judgement that they are unrelated covers both.
 */
function identify(components: string[]): string {
	return components.toSorted().join('\n');
}

/** One repetition as every message here prints it: what is written, and where. */
function shape(each: Candidate): string[] {
	return [
		`  ${each.files.length} components write the same ${each.declarations.length} declarations:`,
		...each.declarations.map((one) => `      ${one}`),
		...each.files.map((one) => `      in ${one}`),
	];
}

/** The entry to paste, spelled as the record spells it: the reader copies rather than writes. */
function paste(components: string[]): string[] {
	return [
		'\t\t{',
		'\t\t\t"components": [',
		...components.map((one, at) => `\t\t\t\t"${one}"${at === components.length - 1 ? '' : ','}`),
		'\t\t\t]',
		'\t\t}',
	];
}

/** What the reader does about a repetition the record has never seen: name it, or list it. */
function unlisted(components: string[], found: Candidate[]): string {
	return [
		`${RECORDED} lists nothing about a repetition the tree holds:`,
		...found.flatMap(shape),
		`  Give the group a key in apps/site/src/lib/surfaces.ts, or add this to 'groups' in`,
		`  ${RECORDED}:`,
		...paste(components),
		'  Red here is the list working rather than a fault in it: either this repetition is',
		'  new and wants judging, or the tree has moved since the list was written. Both take',
		'  the same repair -- paste the entry above. With no "stays" it records that nobody has',
		'  judged the group, which is the state this gate counts rather than fails on. Add',
		'  "stays" once somebody has: extraction.md wants the three components unrelated, and',
		'  no count can tell a recipe from a copy.',
	].join('\n');
}

/** What the reader does about an entry whose repetition the tree no longer holds. */
function gone(entry: Entry): string {
	const judged =
		entry.stays === undefined
			? ['  Nobody had judged it, so the entry says nothing the tree does not.']
			: ['  It was judged, and this is the judgement being dropped:', `      ${entry.stays}`];
	return [
		`${RECORDED} lists components that no longer repeat any set of declarations:`,
		...entry.components.map((one) => `      in ${one}`),
		...judged,
		'  Somebody named the declarations, or a component stopped writing them. Delete the entry',
		`  from 'groups' in ${RECORDED}: an entry matching nothing`,
		'  counts judged work the tree does not show.',
	].join('\n');
}

/** One entry of the record, or why it could not be read. A hand-edited file is input like any. */
function entryOf(raw: unknown, at: number): Entry | string {
	const where = `${RECORDED}, entry ${at + 1} of 'groups',`;
	if (typeof raw !== 'object' || raw === null) return `${where} is not an object.`;
	const { components, stays } = raw as { components?: unknown; stays?: unknown };
	if (!Array.isArray(components) || components.some((one) => typeof one !== 'string')) {
		return `${where} has no 'components' array of file paths.`;
	}
	if (components.length < THRESHOLD) {
		return (
			`${where} lists ${components.length} components, under the bar of ${THRESHOLD}. ` +
			'No group this gate finds is that small, so the entry can never match one.'
		);
	}
	if (stays !== undefined && typeof stays !== 'string') {
		return `${where} has a 'stays' that is not a sentence saying why the group is no recipe.`;
	}
	const listed = components as string[];
	return stays === undefined ? { components: listed } : { components: listed, stays };
}

/** One set of components under two entries: the second is never read, so one is a mistake. */
function twice(entry: Entry): string {
	return [
		`${RECORDED} lists one set of components under two entries of 'groups':`,
		...entry.components.map((one) => `      in ${one}`),
		'  One entry per set of components, carrying the one judgement that covers whatever they',
		'  repeat. Merge the two, or the second says nothing.',
	].join('\n');
}

/**
 * The record, or the reasons it could not be read.
 *
 * A file a person edits is input, and a gate that cannot read its input has to say so: a cast
 * over a malformed record would silently judge every group unlisted. See spec/code.md.
 */
function ledger(): { entries: Entry[]; broken: string[] } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(RECORD, 'utf8'));
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		return {
			entries: [],
			broken: [`${RECORDED} is not JSON: ${why}. This gate judges nothing until it parses.`],
		};
	}
	const groups: unknown = (parsed as Partial<Ledger>).groups;
	if (!Array.isArray(groups)) {
		return {
			entries: [],
			broken: [
				`${RECORDED} holds no 'groups' array. It is the list of repeated declaration groups ` +
					'nobody has named, one entry per set of components.',
			],
		};
	}
	const read = groups.map(entryOf);
	const broken = read.filter((each) => typeof each === 'string');
	const entries = read.filter((each) => typeof each !== 'string');
	return { entries, broken };
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

	const record = ledger();
	failures.push(...record.broken);
	const unnamed = candidates(found);

	const repeated = new Map<string, Candidate[]>();
	for (const each of unnamed) {
		const key = identify(each.files);
		repeated.set(key, [...(repeated.get(key) ?? []), each]);
	}
	const listed = new Map<string, Entry>();
	for (const entry of record.entries) {
		const key = identify(entry.components);
		if (listed.has(key)) failures.push(twice(entry));
		else listed.set(key, entry);
	}
	// Only once the record parsed: against an unreadable one every group looks unlisted and every
	// entry looks stale, which buries the one line saying why.
	if (record.broken.length === 0) {
		for (const [key, group] of repeated) {
			if (!listed.has(key)) failures.push(unlisted(group[0]!.files, group));
		}
		for (const [key, entry] of listed) if (!repeated.has(key)) failures.push(gone(entry));
	}

	if (failures.length > 0) {
		for (const line of failures) console.error(line);
		return 1;
	}
	const names = found.groups.filter((group) => DECLARING.has(group.file));
	const total = names.reduce((sum, group) => sum + group.keys.length, 0);
	const judged = unnamed.filter(
		(each) => listed.get(identify(each.files))?.stays !== undefined,
	).length;
	console.log(
		`every one of the ${total} names in the visual layer is applied in ${THRESHOLD} components ` +
			`or more; ${unnamed.length} repeated declaration groups carry no name -- ${judged} judged ` +
			`and kept, ${unnamed.length - judged} not yet looked at, all of them in ${RECORDED}`,
	);
	return 0;
}

process.exit(main());

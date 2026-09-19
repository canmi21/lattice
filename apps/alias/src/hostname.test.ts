import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isValidHostname } from './hostname';
import { tonesFor } from './resolve';

/**
 * The other end of one pipeline, read rather than remembered.
 *
 * `cms favicon` decides which hostnames are worth collecting an icon for and this side decides
 * which it will look one up for. A name only one of them takes is an object in the bucket that is
 * a 400 for ever, or a lookup that can never hit -- and the two had already drifted, over
 * `999.999.999.999`. So every number and every case below comes out of the Rust.
 */
const HOST_RS = readFileSync(
	fileURLToPath(new URL('../../cms/src/favicon/host.rs', import.meta.url).href),
	'utf8',
);

const FETCHABLE = /pub fn is_fetchable\(host: &str\) -> bool \{([\s\S]*?)\n\}/.exec(HOST_RS);

/** One rule out of `is_fetchable`, as a number. Absent means the rule moved, which is a failure. */
function rule(pattern: RegExp): number {
	expect(FETCHABLE, 'is_fetchable moved or changed shape in apps/cms').not.toBeNull();
	const found = pattern.exec(FETCHABLE![1]!);
	expect(found, `${pattern.source} is no longer a rule in is_fetchable`).not.toBeNull();
	return Number(found![1]);
}

/** A hostname of `count` identical labels, for the rules that count them. */
function ofLabels(count: number, label: string): string {
	return Array.from({ length: count }, () => label).join('.');
}

/**
 * A hostname of exactly `total` characters, built from labels no rule objects to.
 *
 * Letters, so nothing can read as an address, and no label longer than the limit, so the only
 * thing the result is at stake on is its total length.
 */
function ofLength(total: number, label: number): string {
	const labels: string[] = [];
	let left = total;
	while (left > label + 1) {
		labels.push('a'.repeat(label));
		left -= label + 1;
	}
	labels.push('a'.repeat(left));
	return labels.join('.');
}

describe('isValidHostname', () => {
	/**
	 * The cases both sides answer, read out of the table the Rust suite runs.
	 *
	 * Two people wrote this suite twice, in two languages, neither reading the other, and the
	 * drift that produced sat in both for as long as nobody compared them. There is one copy now
	 * and it lives in the Rust, because the collector is the side that was right.
	 */
	const SHARED = /const SHARED: \[\(&str, bool\); \d+\] = \[([\s\S]*?)\n\t\];/.exec(HOST_RS);

	it('answers every hostname the collector answers', () => {
		expect(SHARED, 'the shared table moved or changed shape in apps/cms').not.toBeNull();
		const cases = [...SHARED![1]!.matchAll(/\("([^"]+)", (true|false)\)/g)];
		expect(cases.length).toBeGreaterThan(0);

		for (const [, host, fetchable] of cases) {
			expect(isValidHostname(host!), `${host} is a site to one side and not the other`).toBe(
				fetchable === 'true',
			);
		}
	});

	/**
	 * Four labels that together form an address, which is not the same as four short numbers.
	 *
	 * The Rust asks each label to parse as a `u8`; this side used to ask for one to three digits,
	 * which rejected `999.999.999.999` as an address when it is no address at all. The ceiling is
	 * read off the integer type the Rust names, so widening it there fails here.
	 */
	it('rejects an address at the width the collector parses', () => {
		const bits = rule(/label\.parse::<u(\d+)>\(\)/);
		const highest = 2 ** bits - 1;
		expect(isValidHostname(`${highest}.0.0.1`)).toBe(false);
		expect(isValidHostname(`${highest + 1}.0.0.1`)).toBe(true);
	});

	it('counts the labels an address has the way the collector counts them', () => {
		const labels = rule(/labels\.len\(\) == (\d+)/);
		expect(isValidHostname(ofLabels(labels, '1'))).toBe(false);
		// One label short is a name, and one long is a name: only the exact count is an address.
		expect(isValidHostname(ofLabels(labels - 1, '1'))).toBe(true);
		expect(isValidHostname(ofLabels(labels + 1, '1'))).toBe(true);
	});

	it('wants as many labels as the collector wants', () => {
		const fewest = rule(/labels\.len\(\) < (\d+)/);
		expect(isValidHostname(ofLabels(fewest - 1, 'a'))).toBe(false);
		expect(isValidHostname(ofLabels(fewest, 'a'))).toBe(true);
	});

	/** The two lengths, taken off the Rust and walked over from one side to the other. */
	it('draws the length limits where the collector draws them', () => {
		const label = rule(/label\.len\(\) <= (\d+)/);
		const total = rule(/host\.len\(\) > (\d+)/);

		expect(isValidHostname(`${'a'.repeat(label)}.com`)).toBe(true);
		expect(isValidHostname(`${'a'.repeat(label + 1)}.com`)).toBe(false);

		expect(ofLength(total, label)).toHaveLength(total);
		expect(isValidHostname(ofLength(total, label))).toBe(true);
		expect(isValidHostname(ofLength(total + 1, label))).toBe(false);
	});
});

/**
 * Naming a tone means that tone or nothing.
 *
 * No silent substitution: a caller that asked for dark and received light has no way to know it
 * happened, and would draw a light icon on a dark surface believing it had the right one. A 404
 * hands the choice back. With no tone named, either will do.
 */
describe('which tone a request settles for', () => {
	it('takes a named tone or nothing', () => {
		expect(tonesFor('dark')).toEqual(['dark']);
		expect(tonesFor('light')).toEqual(['light']);
	});

	it('takes either when none is named', () => {
		expect(tonesFor(undefined)).toEqual(['light', 'dark']);
	});

	it('treats a tone it does not know as none at all', () => {
		expect(tonesFor('sepia')).toEqual(['light', 'dark']);
	});
});

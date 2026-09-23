import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { expect, it } from 'vitest';
import { TRANSLATABLE_FRONTMATTER } from './compile';

/**
 * The Rust declaration this list is a copy of.
 *
 * Read out of the source rather than out of a generated artefact, so there is no regeneration
 * step to forget. The declared length is captured too: a list edited without its count is a Rust
 * compile error, and matching both here means this test cannot pass against a half-edited one.
 */
const DECLARATION = /const TRANSLATABLE_FRONTMATTER: \[&str; (\d+)\] = \[([^\]]*)\]/;

it('lists the frontmatter keys local i18n actually translates', () => {
	const source = readFileSync(
		fileURLToPath(new URL('../../../apps/local/src/i18n/segment.rs', import.meta.url)),
		'utf8',
	);

	const declaration = DECLARATION.exec(source);
	expect(declaration, 'the Rust declaration moved or changed shape').not.toBeNull();

	const [, count, body] = declaration!;
	const authoritative = [...body!.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

	expect(authoritative).toHaveLength(Number(count));
	// Order matters as little as the count does, but comparing both is free and a reordering is
	// worth seeing: it usually means somebody edited one list and retyped the other.
	expect([...TRANSLATABLE_FRONTMATTER]).toEqual(authoritative);
});

/**
 * Every article's dates, read from the corpus rather than from a fixture.
 *
 * Nothing writes these -- they are typed by hand and no schema in either language declares
 * them -- so this is the only thing holding the shape. See spec/architecture/delivery.md.
 */
const SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CONTENTS = new URL('../../../contents/', import.meta.url);

function articles(): { path: string; front: Record<string, string> }[] {
	const found: { path: string; front: Record<string, string> }[] = [];
	for (const entry of readdirSync(CONTENTS, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
		const path = `${entry.parentPath}/${entry.name}`;
		const block = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, 'utf8'));
		if (!block) continue;
		const front = parseYaml(block[1]!) as Record<string, string>;
		// A page carries no `lang` and no dates; see apps/local/src/articles.rs.
		if (typeof front.lang === 'string') found.push({ path, front });
	}
	return found;
}

it('dates every article three ways, to the second', () => {
	const found = articles();
	expect(found.length, 'no articles found, so this test proves nothing').toBeGreaterThan(0);

	for (const { path, front } of found) {
		for (const key of ['created', 'published', 'lastmod']) {
			// Presence before shape: a missing key reaches `toMatch` as undefined, which reports a
			// type error and swallows the message naming the file that is short a date.
			expect(front[key], `${path} carries no ${key}`).toBeTypeOf('string');
			expect(front[key], `${path} dates ${key} more finely than a second`).toMatch(SECONDS);
		}
		// Public before modified, and written before public. An article may be all three at once.
		expect(Date.parse(front.published!), path).toBeGreaterThanOrEqual(Date.parse(front.created!));
		expect(Date.parse(front.lastmod!), path).toBeGreaterThanOrEqual(Date.parse(front.published!));
	}
});

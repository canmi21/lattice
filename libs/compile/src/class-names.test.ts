import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { COLOR_CLASSES, FONT_CLASSES, compilePage } from './compile.ts';

/**
 * The compiler's own text, which is what Tailwind's scanner reads.
 *
 * Read from disk rather than asserted against a list written here: a second list would be the
 * same promise made twice, and the thing under test is whether the name reaches the file the
 * scanner opens. `style-classes.ts` is inside the scanned tree -- `max-sm:mt-4` is written nowhere
 * else in the repository and is in the built stylesheet.
 */
const COMPILER = readFileSync(new URL('./style-classes.ts', import.meta.url), 'utf8');

/** Every class one `:t` per marker produces, read back off the rendered spans. */
function classNames(markers: string[]): string[] {
	const body = markers.map((marker) => `:t[word]{${marker}}`).join(' ');
	const page = compilePage(`---\ntitle: Test\n---\n\n${body}\n`, 'opens in new tab');
	const html = page.blocks
		.flatMap((block) => (block.type === 'p' ? block.segments : [block]))
		.flatMap((part) => ('html' in part ? [part.html] : []))
		.join(' ');
	return [...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1]!.split(' '));
}

it('writes every class a :t can ask for as a literal, so the scanner reads it', () => {
	const names = classNames([
		...Object.keys(FONT_CLASSES).map((token) => `font="${token}"`),
		...Object.keys(COLOR_CLASSES).map((token) => `color="${token}"`),
		'italic',
		'bold',
		'underline',
		'nowrap',
		'wide',
		'narrow',
		'ownline',
		'apart',
	]);
	expect(names).toContain('text-blue');
	for (const name of new Set(names)) {
		// The cause: `text-${attrs.color}` assembled the name at runtime, so Tailwind never read
		// `text-blue`, `text-accent` or `text-text` and emitted no rule for any of them. A name
		// absent from this source is absent from the stylesheet, silently.
		expect(COMPILER.includes(`'${name}'`), `${name} is built, not written`).toBe(true);
	}
});

it('joins no class name from a prefix and a token, which is the shape of the bug', () => {
	// The half above cannot see this one alone: a table left in place makes every joined name
	// findable in the source while the compiler still assembles it at runtime. One assertion
	// says the name is written down, this one says it is not built -- and only both together
	// hold the rule. Text is the only instrument for it, because a scanner reads text.
	const joined = /`(?:text|font|bg|border)-\$\{/.test(COMPILER);
	expect(joined, 'a class name is assembled from a template literal').toBe(false);
});

it('refuses a token the table does not name, and says which file asked', () => {
	const raw = '---\ntitle: Test\n---\n\n:t[word]{color="brand"}\n';
	expect(() => compilePage(raw, 'opens in new tab', 'contents/page.md')).toThrow(
		'contents/page.md: :t color must be one of',
	);
});

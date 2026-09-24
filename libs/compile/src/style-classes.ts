/**
 * The classes a `:t` asks for, from the tokens the author wrote on it.
 *
 * Apart from the compiler because the editor draws a `:t` too, in the browser, and the compiler
 * reads files at load; this module reads nothing. Both call the one table, so the editor cannot
 * style a run differently from the page. The names are written out whole here because this is the
 * file Tailwind's scanner reads them in -- see class-names.test.ts.
 */

/** A directive's attributes as remark gives them. */
export type DirectiveAttrs = Record<string, string | null | undefined>;

/**
 * Every colour class `:t` can ask for, written out whole.
 *
 * A joined name is one Tailwind's scanner never reads, so it emits no rule and the run is
 * silently unstyled -- `text-blue` and `text-text` were both absent from the built CSS, and
 * `text-text-strong` worked only because `compile.ts` writes that string literally for links. The
 * length is the point, and class-names.test.ts holds it. See spec/architecture/css/authoring.md.
 */
export const COLOR_CLASSES = {
	text: 'text-text',
	'text-muted': 'text-text-muted',
	'text-soft': 'text-text-soft',
	'text-strong': 'text-text-strong',
	ink: 'text-ink',
	accent: 'text-accent',
	blue: 'text-blue',
	'blue-ink': 'text-blue-ink',
	green: 'text-green',
	'green-ink': 'text-green-ink',
	red: 'text-red',
	'red-ink': 'text-red-ink',
} as const;

/** Literals for the same reason. `font-baskerville` is libs/fonts; the other two are Tailwind's. */
export const FONT_CLASSES = {
	baskerville: 'font-baskerville',
	mono: 'font-mono',
	serif: 'font-serif',
} as const;

/**
 * The class a token names, or a refusal that names the article.
 *
 * A token nothing answers for used to compile to a class with no rule behind it, which is the
 * one outcome indistinguishable from a typo: the page renders, the word is unstyled, and the
 * build says nothing. Thrown here rather than checked in a gate, so the article is named.
 */
function classFor(
	table: Record<string, string>,
	attribute: string,
	value: string,
	source: string,
): string {
	const name = table[value];
	if (!name) {
		throw new Error(
			`${source}: :t ${attribute} must be one of ${Object.keys(table).join(', ')}, got "${value}"`,
		);
	}
	return name;
}

// `:t` attributes -> utility classes. font/color carry token names, looked up above;
// the rest are boolean flags.
export function styleClasses(attrs: DirectiveAttrs, source: string): string[] {
	const classes: string[] = [];
	if (attrs.font) classes.push(classFor(FONT_CLASSES, 'font', attrs.font, source));
	if (attrs.color) classes.push(classFor(COLOR_CLASSES, 'color', attrs.color, source));
	if ('italic' in attrs) classes.push('italic');
	if ('bold' in attrs) classes.push('font-bold');
	if ('underline' in attrs) classes.push('underline');
	if ('nowrap' in attrs) classes.push('whitespace-nowrap');
	// A run the page drops on a narrow screen. Only the page: the class means nothing to a feed
	// reader and the markdown and text targets carry no classes at all, so `/llms.txt` and the
	// `.md` view keep the sentence. Subtracting on a phone is a layout decision, not an edit.
	if ('wide' in attrs) classes.push('hidden', 'sm:inline');
	// Its opposite, and the only marker that adds words rather than removing them. A phone reads a
	// shorter bio, so a sentence that only it sees has to earn the space: this exists because
	// subtracting left one paragraph ending mid-thought, and the sentence that finishes it costs
	// the desktop composition a fourth line with an orphan on it.
	if ('narrow' in attrs) classes.push('sm:hidden');
	// A run that takes a line of its own on a narrow screen and stays in the sentence on a wide
	// one. `display: block` rather than a `<br>`: the break is a property of the run, not an
	// element whose only job is to be hidden half the time.
	//
	// Mark the run *before* the break, never the one after it. A `:link` nested inside another
	// directive stops being a top-level node, and the page renders those live for their icons --
	// nested, it comes back a plain anchor with the source file's path as its new-tab note.
	if ('ownline' in attrs) classes.push('max-sm:block');
	// Space above a run that has taken a line of its own, so it reads as a new paragraph rather
	// than a stray break. The number is the gap the bio already puts between its paragraphs;
	// composable with `ownline` rather than folded into it, because a line of its own and a break
	// before it are two decisions and an author may want only the first.
	if ('apart' in attrs) classes.push('max-sm:mt-4');
	return classes;
}

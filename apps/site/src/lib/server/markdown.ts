/**
 * A page's markdown, for a reader that asks for it: the source as written, said to be so, and
 * where the language they asked for is when the source is in another. See
 * spec/architecture/markdown.md.
 */

/** A media type's weight in an `Accept` header, 0 when it is not named. */
function weightOf(accept: string, type: string): number {
	for (const entry of accept.split(',')) {
		const [name, ...params] = entry.trim().split(';');
		if (name?.trim().toLowerCase() !== type) continue;
		const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
		const weight = q ? Number(q.slice(2)) : 1;
		return Number.isFinite(weight) ? weight : 0;
	}
	return 0;
}

/** Whether `accept` names markdown and weighs it no lower than HTML; a browser never names it. */
export function prefersMarkdown(accept: string | null): boolean {
	if (!accept) return false;
	const markdown = weightOf(accept, 'text/markdown');
	return markdown > 0 && markdown >= weightOf(accept, 'text/html');
}

const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

/** About how many tokens a model reads: a CJK character each, four other characters each. */
export function tokensIn(text: string): number {
	const wide = text.match(WIDE)?.length ?? 0;
	return wide + Math.ceil((text.length - wide) / 4);
}

/**
 * A language tag's English name, by its language alone -- `de-DE` is German -- except Chinese,
 * whose region tells the script apart. The tag itself where the runtime cannot name it.
 */
function nameOf(tag: string): string {
	const language = tag.split('-')[0]!;
	try {
		return new Intl.DisplayNames(['en'], { type: 'language' }).of(
			language.toLowerCase() === 'zh' ? tag : language,
		) ?? tag;
	} catch {
		return tag;
	}
}

/** Whether the primary subtags differ: `zh` and `zh-TW` are one language, `zh` and `de` two. */
const otherLanguage = (a: string, b: string) =>
	a.split('-')[0]!.toLowerCase() !== b.split('-')[0]!.toLowerCase();

export interface NoticeInput {
	/** The source's language, from its front matter. */
	source: string;
	/** The language the reader asked for, and where that view is as HTML, if not the source's. */
	asked?: { tag: string; page: string };
}

/** One line in English: the source as written, and where the asked language is if another. */
export function noticeFor({ source, asked }: NoticeInput): string {
	const written = `the source of this page, provided as written, in ${nameOf(source)} (${source})`;
	if (!asked || !otherLanguage(asked.tag, source)) return `> This is ${written}.`;
	const language = nameOf(asked.tag);
	return `> No text/markdown version of this page exists in ${language} (${asked.tag}); below is ${written}. The ${language} version is available as text/html at ${asked.page}.`;
}

const FRONT_MATTER = /^---\n[\s\S]*?\n---\n/;

/** The language a markdown source names in its front matter, if it names one. */
export function languageOf(markdown: string): string | undefined {
	const matter = FRONT_MATTER.exec(markdown)?.[0];
	return matter ? /^lang:\s*(\S+)\s*$/m.exec(matter)?.[1] : undefined;
}

/** `markdown` with `notice` as its first line after the front matter, which must stay first. */
export function withNotice(markdown: string, notice: string): string {
	const matter = FRONT_MATTER.exec(markdown)?.[0] ?? '';
	return `${matter}\n${notice}\n\n${markdown.slice(matter.length).replace(/^\n+/, '')}`;
}

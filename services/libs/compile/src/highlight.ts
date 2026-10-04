import { bundledLanguagesInfo, createHighlighter, isPlainLang, type Highlighter } from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { oneLightPro } from './one-light-pro.ts';

export type CodeBlock = {
	lang: string;
	code: string;
};

const LANGS = [
	'rust',
	'toml',
	'bash',
	'shell',
	'json',
	'typescript',
	// JSX is not in the TypeScript grammar, so a fence carrying it needs this one or its tags
	// degrade into comparisons and bare identifiers. See spec/styling/blocks.md.
	'tsx',
	'javascript',
	'svelte',
	'html',
	'css',
];

const LANGUAGE_LABELS = new Map(
	bundledLanguagesInfo.flatMap(({ id, name, aliases = [] }) =>
		[id, ...aliases].map((language) => [language.toLowerCase(), name] as const),
	),
);

/** Resolve a Markdown fence id or alias to the language's canonical display name. */
export function languageLabel(lang: string): string | undefined {
	const authored = lang.trim();
	if (!authored || isPlainLang(authored.toLowerCase())) return undefined;
	return LANGUAGE_LABELS.get(authored.toLowerCase()) ?? authored;
}

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: [oneLightPro, 'one-dark-pro'],
			langs: LANGS,
			engine: createJavaScriptRegexEngine(),
		});
	}
	return highlighterPromise;
}

export async function highlight(code: string, lang: string): Promise<string> {
	const highlighter = await getHighlighter();
	return highlighter.codeToHtml(code, {
		lang,
		themes: { light: 'one-light-pro', dark: 'one-dark-pro' },
		defaultColor: false,
	});
}

export async function highlightBlocks<T extends Record<string, CodeBlock>>(
	blocks: T,
): Promise<Record<keyof T, string>> {
	const entries = await Promise.all(
		Object.entries(blocks).map(
			async ([key, block]) => [key, await highlight(block.code, block.lang)] as const,
		),
	);
	return Object.fromEntries(entries) as Record<keyof T, string>;
}

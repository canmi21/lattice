/**
 * `llms.txt` and `llms-full.txt`, assembled at request time in the shape llmstxt.org sets out: the
 * site's name, its one description, how to read it, then the articles and the site's other
 * documents, the skippable ones last under `Optional`. Every fact is a projection of the published
 * root, so neither is an object of its own. See spec/architecture/markdown.md, "The index".
 */
import type { HomeAnswer } from '@monoflake/artifacts';
import { URLS } from '@monoflake/sdk';
import { stamp } from '../server/agent-view';
import { nameOf } from '../server/markdown';
import { documentLink, documentUrl } from './elsewhere';

/** Collapse YAML-folded whitespace so a subtitle stays on one line. */
function oneline(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

export interface LlmsInput {
	articles: HomeAnswer['articles'];
	/** Each article's original language, by slug, where the API said. */
	languages: Readonly<Record<string, string>>;
	site: { name: string; tagline: string };
	author: { name: string };
	/** Each of the author's own accounts that are shown. */
	profiles: readonly string[];
	/** The Telegram group the author runs. */
	group: string;
	/** When the published corpus was written. */
	generated?: string;
	now: Date;
}

/** The opening both share: the name, the one description, and how the site is read. */
function opening({ site, author, generated, now }: LlmsInput): string[] {
	const web = URLS.apps.production.site;
	return [
		`# ${site.name}`,
		'',
		`> ${site.tagline} The site of ${author.name}.`,
		'',
		`Generated ${stamp(now)}${generated ? `, from the corpus published ${stamp(generated)}` : ''}.`,
		'',
		`- Every page has an agent view at its own address with \`.md\` appended; the homepage's is ${documentUrl('homepage')}. A request with \`Accept: text/markdown\` at a page's own address gets the same view.`,
		"- A view is in the original language of what it shows. Translations are text/html, at the page's address with `?lang=` and one of `de`, `en`, `es`, `fr`, `ja`, `ko`, `zh` or `tw`.",
		`- Search, AI input and AI training are all permitted, as the Content-Signal and Content-Usage lines in ${web}/robots.txt say.`,
	];
}

/**
 * One article as a list item: its view, the facts that rank it, then its subtitle last, which
 * keeps its own punctuation in its own script.
 */
function articleItem(article: HomeAnswer['articles'][number], language?: string): string {
	const subtitle = oneline(article.meta.subtitle);
	const facts = [
		`In ${article.path.split('/')[0]}`,
		`published ${article.dates.published.slice(0, 10)}`,
		...(language ? [`in ${nameOf(language)} (${language})`] : []),
		`${article.metrics.words.toLocaleString('en-US')} words`,
	];
	return `- [${article.meta.title}](${article.url}.md): ${facts.join(', ')}. ${subtitle}`;
}

// Deliberately not locale-aware -- see spec/locale/addressing.md, "Every page negotiates; the
// exceptions are documents", for why this is one of the exceptions.
export function buildLlms(input: LlmsInput): string {
	const body = [
		...opening(input),
		'',
		'## Articles',
		'',
		...input.articles.map((article) => articleItem(article, input.languages[article.slug])),
		'',
		'## Site',
		'',
		documentLink('homepage'),
		...input.profiles.map(
			(profile) =>
				`- [${input.author.name} at ${new URL(profile).hostname}](${profile}): An account of the author's.`,
		),
		`- [${input.author.name}'s Telegram group](${input.group}): A group the author runs.`,
		'',
		'## Optional',
		'',
		documentLink('full'),
		documentLink('sitemap'),
		documentLink('feed'),
		`- [Status](${URLS.internal.status.canonical}): Whether the services behind this site are up.`,
	].join('\n');
	return `${body}\n`;
}

/** `llms-full.txt`: the same opening, then every article's agent view, newest first. */
export function buildLlmsFull(input: LlmsInput, views: readonly string[]): string {
	return `${[...opening(input), '', ...views.map((view) => `---\n\n${view.trim()}\n`)].join('\n')}\n`;
}

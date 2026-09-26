/**
 * What a paragraph's inline syntax compiles to: the `:t`, `:link`, `:fn` and `:tn` directives, the
 * social links and mailboxes behind `:link`, footnote numbering, and a top-level prose node
 * rendered to HTML for the page or lowered to plain markdown for the text targets. `compile.ts`
 * assembles blocks out of these.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { URLS } from '@canmi/urls';
import { toHtml } from 'hast-util-to-html';
import { toHast, type Handler } from 'mdast-util-to-hast';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { parse as parseYaml } from 'yaml';
import { styleClasses } from './style-classes.ts';
import type { InlineSegment, ArticleNote } from '@canmi/artifacts/types';
import type { TextDirective } from 'mdast-util-directive';
import type { Heading, Nodes, Paragraph, Root, RootContent } from 'mdast';

declare module 'mdast-util-directive' {
	interface TextDirectiveData {
		/**
		 * The number a `:fn` was given, written on the node by `numberNotes`.
		 *
		 * On the node rather than in a map beside it, so every target -- page, feed, markdown --
		 * reads the number the counter actually assigned instead of deriving its own.
		 */
		footnoteNumber?: number;
	}
}

// Feed and markdown targets need absolute image URLs, and they must resolve the same way the
// rendered page does. Both now read the host from libs/urls rather than each spelling it out.

export const stringifier = unified()
	.use(remarkStringify, { bullet: '-', fences: true })
	.use(remarkGfm);

// DLC directives extend markdown with display-only semantics that compile
// differently per target: rich HTML for the page, plain markdown for /llms.txt.
// `:t[text]{...}` is a styled span; `:link[platform]{to=handle}` a social link.
export type DirectiveAttrs = Record<string, string | null | undefined>;

type SocialPlatform = 'twitter' | 'github' | 'email';

const SOCIAL: Record<
	SocialPlatform,
	{ href: (handle: string) => string; follow?: (handle: string) => string; new_tab: boolean }
> = {
	twitter: {
		href: (h) => `${URLS.external.social.twitter}/${h}`,
		follow: (h) => `${URLS.external.social.twitterIntent}?screen_name=${h}`,
		new_tab: true,
	},
	github: { href: (h) => `${URLS.external.github.web}/${h}`, new_tab: true },
	email: { href: (h) => `mailto:${h}`, new_tab: false },
};

/** A `to` that is already an address rather than the name of one. */
const ADDRESS = /^[^@\s]+@[^@\s]+$/u;

/**
 * Every mailbox the corpus may name, as a name to an address.
 *
 * Read from the file rather than through `virtual:site`, because this runs outside the Vite
 * graph -- the same reason `scripts/indexnow.ts` reads it. The site's boxes are composed from
 * the one domain the config carries, so no article and no consumer writes an address out.
 */
function readMailboxes(): Record<string, string> {
	const path = fileURLToPath(new URL('../../../apps/site/site.config.yaml', import.meta.url));
	const config = parseYaml(readFileSync(path, 'utf8')) as {
		author?: { email?: string };
		mail?: { domain?: string; boxes?: Record<string, string> };
	};
	const author = config.author?.email;
	const domain = config.mail?.domain;
	if (!author || !domain) {
		throw new Error('site.config.yaml: author.email and mail.domain are both required');
	}
	// The author is a person and a box is not, so that one name is reserved: a box called
	// `author` would put two addresses under one token with nothing to say which won.
	const named: Record<string, string> = { author };
	for (const box of Object.keys(config.mail?.boxes ?? {})) {
		if (box in named) throw new Error(`site.config.yaml: mail box "${box}" is a reserved name`);
		named[box] = `${box}@${domain}`;
	}
	return named;
}

const MAILBOXES = readMailboxes();

/**
 * The address a `:link[email]` names, or a refusal that names the article.
 *
 * A name nothing answers for used to compile to `mailto:author`: a live link to nowhere, which
 * renders and reports nothing. Thrown here for the reason `classFor` throws. An address written
 * out in full still passes -- it is a shape this cannot be wrong about.
 */
export function mailbox(name: string, source: string): string {
	if (ADDRESS.test(name)) return name;
	const address = MAILBOXES[name];
	if (!address) {
		const names = Object.keys(MAILBOXES).join(', ');
		throw new Error(
			`${source}: :link[email] to must be an address or one of ${names}, got "${name}"`,
		);
	}
	return address;
}

// `:link[Twitter]{to=canmi21}` resolves to the profile; add the `follow` flag for
// the intent-follow prompt. Unknown platforms fall back to the raw `to` value.
export function resolveLink(
	label: string,
	attrs: DirectiveAttrs,
	source: string,
): { href: string; new_tab: boolean; platform?: SocialPlatform } {
	const handle = attrs.to ?? '';
	const named = label.toLowerCase();
	const platform =
		named in SOCIAL
			? (named as SocialPlatform)
			: ADDRESS.test(handle)
				? ('email' as const)
				: undefined;
	if (!platform) return { href: handle, new_tab: false };
	const target = SOCIAL[platform];
	const to = platform === 'email' ? mailbox(handle, source) : handle;
	const href = target.follow && 'follow' in attrs ? target.follow(to) : target.href(to);
	return { href, new_tab: target.new_tab, platform };
}

/**
 * Number every `:fn` in one top-level node and collect what it says.
 *
 * A separate pass, not work done while rendering: a node is rendered more than once and a
 * counter advanced inside the renderer would count the same note twice.
 *
 * A straight quote in the note text fails the build here rather than rendering an empty marker.
 * The directive syntax has no escape for one, so the parser drops the whole attribute and leaves
 * a directive saying nothing -- indistinguishable from a typo. `validate.rs` refuses it too.
 */
export function numberNotes(node: Nodes, notes: ArticleNote[], source: string): number[] {
	const numbers: number[] = [];
	const visit = (current: Nodes): void => {
		if (current.type === 'textDirective' && (current as TextDirective).name === 'fn') {
			const directive = current as TextDirective;
			const said = ((directive.attributes ?? {}) as DirectiveAttrs).is?.trim();
			const phrase = mdastToString(directive).trim();
			if (!said || !phrase) {
				throw new Error(
					`${source}: :fn is :fn[the words]{is="what they mean"}, and that note cannot contain a straight quote`,
				);
			}
			notes.push({ number: notes.length + 1, phrase, text: said });
			directive.data = { ...directive.data, footnoteNumber: notes.length };
			numbers.push(notes.length);
			return;
		}
		if ('children' in current) {
			for (const child of current.children) visit(child as Nodes);
		}
	};
	visit(node);
	return numbers;
}

export function noteNumber(directive: TextDirective): number | undefined {
	return directive.data?.footnoteNumber;
}

export function markProseLinks(node: Nodes): void {
	if (node.type === 'link') {
		node.data = {
			...node.data,
			hProperties: {
				...node.data?.hProperties,
				className: ['focus-link', 'spring-underline', 'article-link'],
			},
		};
	}
	if ('children' in node) {
		for (const child of node.children) markProseLinks(child);
	}
}

// An address -- a class carrying no declaration, there so a :global() rule or a script can reach
// the node -- is written as a data attribute with the class kept beside it, until the corpus is
// republished and the classes go. See spec/architecture/css/authoring.md.

// Render a top-level prose node to HTML. `delete` (gfm strikethrough) maps to
// <s> so the existing .article-body :global(s) styling keeps working; the DLC
// `:t` / `:link` text directives expand to spans / anchors.
export function proseHtml(node: RootContent, newTabNote: string, source: string): string {
	markProseLinks(node);
	const hast = toHast(node, {
		handlers: {
			delete: (state, deleteNode) => ({
				type: 'element',
				tagName: 's',
				properties: {},
				children: state.all(deleteNode),
			}),
			textDirective: ((state, directiveNode) => {
				const directive = directiveNode as TextDirective;
				const attrs = (directive.attributes ?? {}) as DirectiveAttrs;
				const children = state.all(directive);
				if (directive.name === 'link') {
					const { href, new_tab } = resolveLink(mdastToString(directive), attrs, source);
					if (new_tab) {
						children.push({
							type: 'element',
							tagName: 'span',
							properties: { className: ['sr-only'] },
							children: [{ type: 'text', value: ` (${newTabNote})` }],
						});
					}
					return {
						type: 'element',
						tagName: 'a',
						properties: {
							href,
							className: ['focus-link', 'spring-underline', 'article-link', 'text-text-strong'],
							// hast stores space-separated token lists as arrays, so this stays one even
							// with one token: written as a string, a two-token list once came out as
							// `rel="noopener,noreferrer"`, a single unrecognised token. `noreferrer` is
							// gone on purpose -- the site's referrer policy sends the origin to a site
							// it links to, and this attribute would silence that. See spec/referrer.md.
							...(new_tab ? { target: '_blank', rel: ['noopener'] } : {}),
						},
						children,
					};
				}
				// An author's note wraps the words it explains and puts its marker after them, so
				// the sentence reads exactly as it would without the note and the collected note
				// at the end can name what it is about. The words get a span of their own -- no
				// resting style, purely so the walk back from a note has something to light up:
				// the marker's number is too small to catch an eye landing mid-page.
				// See spec/styling/notes.md.
				if (directive.name === 'fn') {
					const number = noteNumber(directive);
					return [
						{
							type: 'element',
							tagName: 'span',
							properties: { 'data-note-words': true },
							children,
						},
						{
							type: 'element',
							tagName: 'sup',
							properties: { 'data-note-marker': true },
							children: [
								{
									type: 'element',
									tagName: 'a',
									properties: {
										href: `#note-${number}`,
										id: `marker-${number}`,
										// The id sits here, so the scroll margin has to as well: returning to a
										// marker lands it in the same band arriving at a section does.
										// `focus-link` and `jump-target` are recipes and stay classes; only the
										// address travels. See spec/architecture/css/authoring.md.
										className: ['focus-link', 'jump-target'],
										'data-note-marker-link': true,
									},
									children: [{ type: 'text', value: String(number) }],
								},
							],
						},
					];
				}
				// A translator's note explains the marked words in place. It becomes a real button
				// because a native title tooltip cannot carry these paragraph-length notes on touch
				// or keyboard; ArticleBody owns the one live popover used by every prose block.
				if (directive.name === 'tn') {
					const note = typeof attrs.is === 'string' ? attrs.is : '';
					return {
						type: 'element',
						tagName: 'button',
						properties: {
							type: 'button',
							className: ['focus-link'],
							'data-tn-trigger': true,
							'data-tn-note': note,
							ariaControls: ['translator-note'],
							ariaExpanded: 'false',
						},
						children: [
							...children,
							{
								type: 'element' as const,
								tagName: 'svg',
								properties: {
									'data-tn-icon': true,
									viewBox: '0 0 24 24',
									fill: 'none',
									stroke: 'currentColor',
									strokeWidth: '2',
									strokeLineCap: 'round',
									strokeLineJoin: 'round',
									ariaHidden: 'true',
								},
								children: [
									{
										type: 'element' as const,
										tagName: 'circle',
										properties: { cx: '12', cy: '12', r: '10' },
										children: [],
									},
									{
										type: 'element' as const,
										tagName: 'path',
										properties: { d: 'M12 16v-4' },
										children: [],
									},
									{
										type: 'element' as const,
										tagName: 'path',
										properties: { d: 'M12 8h.01' },
										children: [],
									},
								],
							},
						],
					};
				}
				// A spoiler fogs its words until the reader asks for them; the asking is CSS
				// (hover or focus lifts the blur) so nothing here is live. The text stays real
				// underneath -- selectable, translated, read by assistive technology -- because
				// the fog is a display choice, not redaction. tabindex gives keyboards and taps
				// a way to ask on screens that never hover. See spec/styling/notes.md.
				if (directive.name === 'spoiler') {
					return {
						type: 'element',
						tagName: 'span',
						properties: {
							className: ['focus-link'],
							'data-spoiler': true,
							tabIndex: 0,
						},
						children,
					};
				}
				return {
					type: 'element',
					tagName: 'span',
					properties: { className: styleClasses(attrs, source) },
					children,
				};
			}) satisfies Handler,
		},
	});
	return hast ? toHtml(hast) : '';
}

// Lower DLC directives to standard markdown for the text/llms.txt target: `:link`
// becomes a real link; `:t` keeps emphasis where it maps cleanly (bold/italic) and
// is otherwise unwrapped, since the styling is HTML-only.
export function lowerDirectives(nodes: RootContent[], source: string): RootContent[] {
	return nodes.flatMap((node) => {
		if ('children' in node && Array.isArray(node.children)) {
			node.children = lowerDirectives(
				node.children as RootContent[],
				source,
			) as typeof node.children;
		}
		if (node.type === 'textDirective') {
			const directive = node as TextDirective;
			const attrs = (directive.attributes ?? {}) as DirectiveAttrs;
			const children = directive.children as unknown as RootContent[];
			if (directive.name === 'link') {
				const { href } = resolveLink(mdastToString(directive), attrs, source);
				return [{ type: 'link', url: href, children } as unknown as RootContent];
			}
			// The markdown target has a footnote of its own, and remark writes it. A real
			// `footnoteReference` rather than the text `[^1]`, which the serialiser would escape
			// into a literal bracket -- the reference is the node it already knows how to spell.
			if (directive.name === 'fn') {
				const number = String(noteNumber(directive));
				return [
					...children,
					{
						type: 'footnoteReference',
						identifier: number,
						label: number,
					} as unknown as RootContent,
				];
			}
			// Plain text has no way to hide a note behind a word, so it is spelled out in
			// brackets. Dropping it would lose the one thing the note exists to say, and the
			// readers of this target are models rather than people scanning a page.
			if (directive.name === 'tn') {
				const note = typeof attrs.is === 'string' ? attrs.is : '';
				return note
					? [...children, { type: 'text', value: ` [${note}]` } as unknown as RootContent]
					: children;
			}
			if ('bold' in attrs) return [{ type: 'strong', children } as unknown as RootContent];
			if ('italic' in attrs) return [{ type: 'emphasis', children } as unknown as RootContent];
			// `:spoiler` also lands here on purpose: plain text has no fog to lift, and this
			// target's readers are models, so the words are worth more than the hiding.
			return children;
		}
		return [node];
	});
}

export function proseMarkdown(node: RootContent, source: string): string {
	// Lowered first, like the other markdown target. The serialiser has no handler for a
	// directive and throws on one it has not seen, so this path worked only for as long as every
	// directive in the corpus happened to be reachable another way -- `:tn` was the first that
	// was not, and it failed the whole page rather than the one node.
	const text = stringifier
		.stringify({ type: 'root', children: lowerDirectives([node], source) } as Root)
		.trim();
	// The document is the source view and nothing reading it will negotiate, so a link out of it
	// names the source. Prose only: a fence is pushed separately and its contents are not ours to
	// rewrite. The feed does the same to its own prose -- see libs/artifacts, `pinView`.
	return text.replaceAll(
		new RegExp(`\\]\\((${URLS.apps.production.site}/[^)\\s#]*)`, 'g'),
		(whole, address: string) => (address.includes('?') ? whole : `](${address}?lang=mw`),
	);
}

// `## Intro {#getting-started}` -> { text: 'Intro', slug: 'getting-started' }.
// Falls back to a slug derived from the text when no explicit id is present.
export function headingParts(node: Heading): { slug: string; text: string } {
	const raw = mdastToString(node).trim();
	const [, explicitText, explicitSlug] = raw.match(/^(.*?)\s*\{#([\w-]+)\}$/) ?? [];
	if (explicitText !== undefined && explicitSlug !== undefined) {
		return { text: explicitText.trim(), slug: explicitSlug };
	}
	const slug = raw
		.toLowerCase()
		.replace(/[^\w]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return { text: raw, slug };
}

// Split a paragraph into inline segments at `:link` boundaries: text runs (incl.
// `:t` styling) become dead HTML, each `:link` a live segment the route renders
// with its icon. Keeps the {@html} surface minimal, mirroring article blocks.
export function inlineSegments(
	node: Paragraph,
	newTabNote: string,
	source: string,
): InlineSegment[] {
	const segments: InlineSegment[] = [];
	let run: string[] = [];
	const flush = () => {
		if (run.length) {
			segments.push({ type: 'html', html: run.join('') });
			run = [];
		}
	};
	for (const child of node.children) {
		if (child.type === 'textDirective' && child.name === 'link') {
			flush();
			const attrs = (child.attributes ?? {}) as DirectiveAttrs;
			const label = mdastToString(child);
			const { href, new_tab, platform } = resolveLink(label, attrs, source);
			// Both spellings are variants, and a variant sorts after a plain utility. The `:t`
			// markers above can say `hidden sm:inline` because a span has no display utility to
			// argue with; a link is `inline-flex` for its icon, and `hidden` is the same kind of
			// declaration at the same level, so which one won would be decided by Tailwind's
			// emission order rather than by this file. `max-sm:hidden` is not that argument.
			const width = ['wide' in attrs ? 'max-sm:hidden' : '', 'narrow' in attrs ? 'sm:hidden' : '']
				.filter(Boolean)
				.join(' ');
			segments.push({
				type: 'link',
				icon: platform,
				href,
				label,
				new_tab,
				...(width ? { width } : {}),
			});
		} else {
			run.push(proseHtml(child as RootContent, newTabNote, source));
		}
	}
	flush();
	return segments;
}

import { URLS } from '@canmi/urls';
import { toString as mdastToString } from 'mdast-util-to-string';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Resolved, ResolvedVideo } from './assets.ts';
import { assertLanguageTag } from '@canmi/locales';
import { languageLabel } from './highlight.ts';
import { parser } from './parser.ts';
import type {
	Block,
	Compiled,
	CompiledPage,
	CrateRecord,
	PageBlock,
	RepoRecord,
	TocEntry,
	TweetRecord,
	ArticleMeta,
	ArticleNote,
	ArticleReference,
} from '@canmi/artifacts/types';
import type { Root, RootContent } from 'mdast';
import {
	stringifier,
	numberNotes,
	proseHtml,
	lowerDirectives,
	proseMarkdown,
	headingParts,
	inlineSegments,
	type DirectiveAttrs,
} from './inline.ts';
import {
	blockSource,
	codePresentation,
	diagramMarkdown,
	imageOf,
	altFor,
	cropRatio,
	cropAlign,
	unresolved,
	codeMeta,
	mermaidRatio,
	requiredDirectiveAttribute,
	quadrantBlock,
	quadrantRegion,
	cargoView,
	tokeiView,
	cardAlign,
	assertFrontmatterHasNoTranslatorNotes,
} from './fields.ts';

export { syntaxTree } from './parser.ts';
export { COLOR_CLASSES, FONT_CLASSES } from './style-classes.ts';
export { TRANSLATABLE_FRONTMATTER } from './fields.ts';

/**
 * An article's frontmatter, read with the compiler's own parser.
 *
 * `::article` needs the title of an article nothing has compiled yet, and a second reader of
 * the same format is how the two come to disagree: a folded title would reach the card as
 * `>-`. See spec/code.md.
 */
export function articleFrontmatter(raw: string, file: string): ArticleMeta {
	const front = (parser.parse(raw) as Root).children.find((node) => node.type === 'yaml');
	if (!front) throw new Error(`missing frontmatter: ${file}`);
	return readFrontmatter(front.value);
}

/**
 * The frontmatter as YAML, with `draft` reduced to the boolean the type promises.
 *
 * `draft: "true"` is a draft, as `local document::is_draft` has always read it. Lenient rather
 * than strict in both readers because the strict reading publishes the quoted spelling, which
 * is the one failure the flag exists to prevent. See spec/drafts.md.
 */
function readFrontmatter(yaml: string): ArticleMeta {
	const { draft, ...rest } = parseYaml(yaml) as Omit<ArticleMeta, 'draft'> & { draft?: unknown };
	if (draft === undefined) return rest;
	return { ...rest, draft: typeof draft === 'string' ? draft.trim() === 'true' : draft === true };
}

export type CompileContext = {
	/**
	 * What a screen reader is told about a link that opens elsewhere, in this view's language.
	 *
	 * Handed in rather than looked up. This module is imported by vite.config.ts, which runs
	 * before the Paraglide plugin has generated any messages, so a build-time importer cannot
	 * call one. The caller compiles once per view and has both the locale and the message.
	 */
	newTabNote: string;
	resolveAsset: (reference: string) => Resolved | null;
	/**
	 * Which resource is the mark of the site a link card points at, by rid.
	 *
	 * The one thing compile time can settle about an icon, and deliberately the only one: what
	 * the resource currently holds is a fact about the corpus when somebody asks, so the page
	 * resolves it and this names it. Optional, because a caller with no manifest compiles a card
	 * with no mark -- the same state a site nobody has collected an icon for is in.
	 */
	resolveIcon?: (url: string) => string | undefined;
	/**
	 * What a diagram says, by the exact source bytes of the block that draws it, in this view's
	 * language.
	 *
	 * A diagram is a picture the corpus stores as text, so nothing downstream can read it until
	 * the CMS has described it. Absent is the ordinary state for a drawing nobody has run
	 * `local diagram` for yet, and every consumer here falls back to what it said before.
	 */
	describeDiagram?: (source: string) => string | undefined;
	/**
	 * What every article in the corpus is called, in the view being compiled, keyed by path.
	 *
	 * Handed in because the compiler sees one article at a time while an `::article` card names
	 * another. A path this map does not hold is a typo rather than a working state, so the
	 * directive throws instead of degrading -- unlike an embed, nothing has to be fetched first.
	 */
	articles?: Record<string, ArticleReference>;
	/**
	 * What a `::video` reference resolves to, in this view's language.
	 *
	 * Optional where `resolveAsset` is required, because a caller that compiles no video needs no
	 * manifest to hand over: an absent resolver reads exactly like a reference nothing has
	 * imported, which is a state the block already has to render.
	 */
	resolveVideo?: (reference: string) => ResolvedVideo | null;
	/** External facts captured before the site build, so rendering never fetches them. */
	embeds?: {
		crates: Record<string, CrateRecord>;
		repos: Record<string, RepoRecord>;
		tweets: Record<string, TweetRecord>;
	};
	highlight: (code: string, lang: string) => Promise<string>;
	/** Present only while reading the source view; translations inherit validated frontmatter. */
	sourceFile?: string;
};

export async function compile(
	raw: string,
	url: string,
	{
		newTabNote,
		resolveAsset,
		resolveIcon,
		resolveVideo,
		describeDiagram,
		articles,
		highlight,
		sourceFile,
		embeds,
	}: CompileContext,
): Promise<Compiled> {
	const tree = parser.parse(raw) as Root;
	let meta: ArticleMeta | undefined;
	const blocks: Block[] = [];
	const toc: TocEntry[] = [];
	const md: string[] = [];
	const text: string[] = [];
	// Numbered by where they are written, across the whole article rather than per block.
	const notes: ArticleNote[] = [];

	for (const node of tree.children) {
		if (node.type === 'yaml') {
			meta = readFrontmatter(node.value);
			if (sourceFile) assertLanguageTag(meta?.lang, sourceFile);
			assertFrontmatterHasNoTranslatorNotes(meta ?? {}, sourceFile ?? url);
			continue;
		}

		if (node.type === 'heading') {
			// Collected before the text is read off the node. `headingParts` flattens the heading
			// to a string, and a directive with no children leaves nothing behind when it does --
			// which is why a note in a heading never reaches the ToC or the slug.
			const marks = numberNotes(node, notes, sourceFile ?? url);
			const { slug, text: heading } = headingParts(node);
			const superscripts = marks.map((number) => `[^${number}]`).join('');
			blocks.push({
				type: 'heading',
				depth: node.depth,
				slug,
				text: heading,
				...(marks.length > 0 ? { notes: marks } : {}),
			});
			// Only the top level is offered as navigation. The rail is 192px wide and collapses to
			// a column of bars, which makes it a way to reach a section rather than an outline of
			// the article; a subsection is reached by arriving at its parent and reading on. Its
			// anchor still exists and still resolves -- what is filtered is the listing, not the
			// address. See spec/styling/rail.md.
			if (node.depth === 2) toc.push({ slug, text: heading, depth: node.depth });
			md.push(`${'#'.repeat(node.depth)} ${heading}${superscripts}`);
			text.push(heading);
			continue;
		}

		if (node.type === 'code') {
			const lang = node.lang ?? 'text';
			// Mermaid is still authored as an ordinary fenced block, but its source becomes a
			// client-rendered diagram rather than highlighted code. See spec/styling/blocks.md.
			if (lang.toLowerCase() === 'mermaid') {
				const ratio = mermaidRatio(node.meta, sourceFile ?? url);
				const description = describeDiagram?.(blockSource(raw, node));
				blocks.push({
					type: 'mermaid',
					source: node.value,
					...(ratio === undefined ? {} : { ratio }),
					...(description === undefined ? {} : { description }),
				});
				// A feed reader gets what the diagram says, because it cannot run Mermaid; a
				// Markdown reader keeps the fence, because that one it can.
				md.push('```mermaid\n' + node.value + '\n```');
				if (description) text.push(description);
				continue;
			}
			// Pasted straight from the tool, so the markdown keeps something a person can read
			// and check against their terminal. Parsing it back costs less than keeping a second
			// machine-readable copy in step with it.
			if (lang === 'tokei') {
				const props = codeMeta(node.meta);
				const title = props.title || meta?.title || 'code statistics';
				blocks.push({ type: 'tokei', source: node.value, title, view: tokeiView(props.view) });
				md.push('```\n' + node.value + '\n```');
				continue;
			}
			if (lang === 'svg-canvas') {
				const title = node.meta?.trim() || meta?.title || 'diagram';
				const description = describeDiagram?.(blockSource(raw, node));
				blocks.push({ type: 'svgCanvas', svg: node.value, title, description });
				md.push(diagramMarkdown(title, description, url));
				// The one place a diagram reaches the search index. Without a description the
				// drawing is invisible to it, which is what the description is for.
				if (description) text.push(description);
				continue;
			}
			blocks.push({
				type: 'code',
				lang,
				label: languageLabel(lang),
				...codePresentation(node.meta, sourceFile ?? url),
				html: await highlight(node.value, lang),
				code: node.value,
			});
			md.push(`\`\`\`${lang}\n${node.value}\n\`\`\``);
			continue;
		}

		if (node.type === 'containerDirective' && node.name === 'quadrant') {
			const quadrant = quadrantBlock(node, sourceFile ?? url);
			const reading = describeDiagram?.(blockSource(raw, node));
			blocks.push(reading === undefined ? quadrant : { ...quadrant, reading });
			md.push(
				[
					`> [quadrant: ${quadrant.title}]`,
					...(quadrant.description ? [`> ${quadrant.description}`] : []),
					...quadrant.items.map(
						(item) =>
							`> - ${quadrantRegion(item, quadrant.axes)}: ${item.title}${item.note ? ` — ${item.note}` : ''}`,
					),
				].join('\n'),
			);
			text.push(
				[
					quadrant.title,
					...(quadrant.description ? [quadrant.description] : []),
					...quadrant.items.map(
						(item) =>
							`${quadrantRegion(item, quadrant.axes)}: ${item.title}${item.note ? ` — ${item.note}` : ''}`,
					),
				].join('\n'),
			);
			continue;
		}

		if (node.type === 'leafDirective' && node.name === 'quadrant-item') {
			throw new Error(`${sourceFile ?? url}: quadrant-item must be inside a quadrant`);
		}

		if (node.type === 'leafDirective' && node.name === 'linkcard') {
			const attrs = node.attributes ?? {};
			const tone: 'light' | 'dark' | undefined =
				attrs.tone === 'dark' ? 'dark' : attrs.tone === 'light' ? 'light' : undefined;
			const href = attrs.url ?? '';
			// The rid, and not the hostname the author wrote: the address an icon lives at is
			// somebody else's to change, and a compiled article that carried one would have to be
			// republished the day they redraw their mark. See spec/architecture/resource.md,
			// "A rid is resolved three times, and each stage bakes only what it can know".
			const icon = href ? resolveIcon?.(href) : undefined;
			const card = {
				src: attrs.src ?? '',
				url: href,
				title: attrs.title ?? '',
				// The whole key, absent for a site nothing has collected a mark for. A role rather
				// than a field of its own, so the page that resolves a view's resources reads one
				// name on every block instead of a list of block types. See `namedResources`.
				resources: icon ? { icon } : undefined,
				tone,
			};
			// Cropped like `::image`, defaults included: a card is typed on purpose, so saying
			// nothing about the ratio reads as "the usual one" rather than as "leave it alone".
			// Screenshots arrive at whatever shape a window happened to be, and a column of
			// cards at ten heights is the thing a default ratio exists to prevent.
			const crop = cropRatio(attrs.ratio, url, 'linkcard');
			const align = cropAlign(attrs.align, url, 'linkcard');
			// A card's cover is an asset like any other, so it gets the same variants and
			// placeholder. Still resolved here, unlike an article's picture: a cover is what the
			// card is, it is never enlarged and never re-cropped, and moving it would mean a
			// second record on the critical path for an ornament rather than for the subject of a
			// paragraph. Named field by field rather than spread, because what the resolver
			// answers with is now a picture plus what only this build knows.
			const cover = resolveAsset(card.src);
			blocks.push({
				type: 'linkcard',
				...card,
				crop,
				align,
				src: cover?.src ?? card.src,
				srcset: cover?.srcset,
				width: cover?.width,
				height: cover?.height,
				preview: cover?.placeholder,
				description: cover?.description,
			});
			md.push(`[${card.title}](${card.url})`);
			continue;
		}

		// `::article` is a link to another article in this repo, drawn as the card the homepage
		// lists. It carries no copy of its own: name, subtitle and date are the target's, so a
		// retitled article retitles every card pointing at it and each view names it in its own
		// language. Compare `::linkcard`, which describes something outside the corpus and
		// therefore has to be told what to say.
		if (node.type === 'leafDirective' && node.name === 'article') {
			const source = sourceFile ?? url;
			const attrs = (node.attributes ?? {}) as DirectiveAttrs;
			const target = requiredDirectiveAttribute(attrs, 'path', 'article', source);
			const reference = articles?.[target];
			if (!reference) {
				throw new Error(`${source}: ::article path "${target}" does not name an article`);
			}
			// `?lang=mw` spelled out. The markdown target is the source view and nothing in it
			// will negotiate on a reader's behalf, so a link out of it names the source too --
			// the same reason the feed's links name theirs. See spec/locale/views.md.
			const href = `${URLS.apps.production.site}/${target}?lang=mw`;
			blocks.push({ type: 'article', path: target, ...reference });
			md.push(`[${reference.title}](${href}) — ${reference.subtitle}`);
			text.push(`${reference.title}\n${reference.subtitle}`);
			continue;
		}

		// `::image` is the cropped presentation of an asset. Plain `![]()` stays uncropped, so
		// writing this directive is itself the request to crop -- which is why the defaults
		// here are a ratio and an alignment rather than "no change".
		if (node.type === 'leafDirective' && node.name === 'image') {
			const attrs = node.attributes ?? {};
			const src = attrs.src ?? '';
			const crop = cropRatio(attrs.ratio, url, 'image');
			const align = cropAlign(attrs.align, url, 'image');
			// Nothing resolving is a refusal rather than a guess -- see `unresolved`. The build
			// still asks, even though a block no longer carries the answer: the markdown target
			// below needs an address a reader can follow, and a reference the committed manifest
			// does not know is a typo or an unimported file, which is the cheapest refusal there
			// is. What the corpus currently publishes is the other stage's to refuse.
			const resolved = resolveAsset(src) ?? unresolved(src, sourceFile ?? url);
			// The published rendition, not the id the author wrote: only renditions are stored,
			// so naming the original gives a feed reader a 404.
			const absolute = resolved.src;
			const alt = altFor(attrs.alt, resolved);

			// The rid and what the article itself decided, and nothing derived from what that
			// resource currently holds: the ladder, the placeholder and the box are resolved per
			// render now, so a picture encoded again stops rewriting every article naming it.
			// See spec/architecture/resource.md, "A rid is resolved three times".
			blocks.push({ type: 'image', resources: { picture: resolved.resource }, alt, crop, align });
			// The crop does not survive into the feed or the markdown target, and should not:
			// neither runs a layout, and a crop is how a page shows an image rather than
			// anything the image says.
			md.push(`![${alt}](${absolute})`);
			if (alt) text.push(alt);
			continue;
		}

		// `::video` names an asset exactly as `::image` does -- a content id whose extension the
		// resolver throws away -- and is looked up in the same manifest. One way to name an asset;
		// what differs is the record it finds, and the resolver owns that difference.
		//
		// No `ratio` or `align`. Cropping exists to make a row of images agree, which has nothing
		// to say about a clip: the poster and the frames after it are one shape, and holding back
		// part of the picture for a whole playback is a different video, not a presentation of it.
		if (node.type === 'leafDirective' && node.name === 'video') {
			const source = sourceFile ?? url;
			const attrs = (node.attributes ?? {}) as DirectiveAttrs;
			const src = requiredDirectiveAttribute(attrs, 'src', 'video', source);
			const resolved = resolveVideo?.(src) ?? null;
			blocks.push({ type: 'video', src, ...resolved });

			// Neither target can play anything, so both get the poster -- a real still of the clip,
			// with the clip's own description as its text -- and a line saying where it plays. The
			// same answer `::mermaid` gets, and for the same reason: a block that cannot survive
			// the trip says what it is and where it is rather than disappearing.
			const described = resolved?.description ?? '';
			const poster = resolved?.poster;
			md.push(`${poster ? `![${described}](${poster})\n\n` : ''}> [video — ${url}]`);
			if (described) text.push(described);
			continue;
		}

		if (node.type === 'leafDirective' && node.name === 'cargo') {
			const name = node.attributes?.crate ?? '';
			const crate = embeds?.crates[name];
			if (crate) {
				blocks.push({ type: 'cargo', crate, view: cargoView(node.attributes?.view) });
				md.push(`> [crate: ${crate.name} ${crate.version}]`);
				continue;
			}
			// Named but not fetched. The article keeps saying which crate it meant, so `local embed`
			// can fill it in later without anyone editing prose to ask again.
			blocks.push({ type: 'placeholder', kind: 'cargo', meta: { crate: name }, pending: true });
			md.push(`> [crate: ${name}]`);
			continue;
		}

		if (node.type === 'leafDirective' && node.name === 'github') {
			const name = node.attributes?.repo ?? '';
			const repo = embeds?.repos[name];
			const git_ref = node.attributes?.ref ?? undefined;
			if (repo) {
				blocks.push({
					type: 'github',
					repo,
					git_ref,
					title: node.attributes?.title ?? undefined,
					align: cardAlign(node.attributes?.align),
				});
				md.push(`> [repository: ${repo.full_name}]`);
				continue;
			}
			blocks.push({ type: 'placeholder', kind: 'github', meta: { repo: name }, pending: true });
			md.push(`> [repository: ${name}]`);
			continue;
		}

		if (node.type === 'leafDirective' && node.name === 'twitter') {
			const id = node.attributes?.tweet ?? '';
			const tweet = embeds?.tweets[id];
			if (tweet) {
				const href = `${URLS.external.social.twitter}/${tweet.author}/status/${tweet.id}`;
				blocks.push({ type: 'twitter', tweet });
				md.push(
					`> ${tweet.text.replaceAll('\n', '\n> ')}\n>\n> — [@${tweet.author} on Twitter](${href})`,
				);
				text.push(tweet.text);
				continue;
			}
			blocks.push({ type: 'placeholder', kind: 'twitter', meta: { tweet: id }, pending: true });
			md.push(`> [tweet: ${id}]`);
			continue;
		}

		if (node.type === 'leafDirective' && node.name === 'placeholder') {
			const { kind, ...rest } = node.attributes ?? {};
			const placeholderMeta: Record<string, string> = {};
			for (const [key, value] of Object.entries(rest)) {
				if (value != null) placeholderMeta[key] = value;
			}
			const label = kind ?? '';
			const metaText = Object.entries(placeholderMeta)
				.map(([k, v]) => ` ${k}="${v}"`)
				.join('');
			blocks.push({ type: 'placeholder', kind: label, meta: placeholderMeta });
			md.push(`> [placeholder ::${label}${metaText}]`);
			continue;
		}

		const image = imageOf(node);
		if (image) {
			// Feed and markdown get one plain URL, because neither can express a srcset and
			// both are read by things that will not run a layout. It is the largest published
			// rendition for the reason above: the authored id names bytes the bucket never got.
			const resolved = resolveAsset(image.url) ?? unresolved(image.url, sourceFile ?? url);
			const absolute = resolved.src;
			const alt = altFor(image.alt, resolved);
			blocks.push({ type: 'image', resources: { picture: resolved.resource }, alt });
			md.push(`![${alt}](${absolute})`);
			if (alt) text.push(alt);
			continue;
		}

		numberNotes(node, notes, sourceFile ?? url);
		blocks.push({ type: 'prose', html: proseHtml(node, newTabNote, sourceFile ?? url) });
		md.push(proseMarkdown(node, sourceFile ?? url));
		const plain = mdastToString(node).trim();
		if (plain) text.push(plain);
	}

	if (notes.length > 0) {
		blocks.push({ type: 'footnotes', notes });
		// The definition carries only what the note says. The phrase is already beside the marker
		// in the body, and a footnote that repeated the word it hangs off would read it twice.
		md.push(notes.map(({ number, text: said }) => `[^${number}]: ${said}`).join('\n'));
		text.push(notes.map(({ phrase, text: said }) => `${phrase} ${said}`).join('\n'));
	}

	if (!meta) throw new Error(`missing frontmatter: ${url}`);

	// Provenance/recency rides as frontmatter on the full article markdown; the
	// index (/llms.txt) stays metadata-free per convention.
	// All three dates, `created` included, even though only `published` is shown anywhere: this
	// document is the article's machine-readable twin, and a reader of it is asking what the
	// source says rather than what a page renders.
	const frontmatter = stringifyYaml({
		title: meta.title,
		created: meta.created,
		published: meta.published,
		lastmod: meta.lastmod,
		lang: meta.lang,
		source: url,
	});

	return {
		meta,
		toc,
		blocks,
		markdown: `---\n${frontmatter}---\n\n# ${meta.title}\n\n${meta.description}\n\n${md.join('\n\n')}\n`,
		text: text.join('\n\n'),
	};
}

// A standalone page (e.g. the homepage at contents/homepage.md). Unlike an article
// it carries free-form frontmatter and produces blocks for the route to render
// plus the DLC-lowered prose body (getPage wraps it into the served document).
export function compilePage(
	raw: string,
	newTabNote: string,
	sourceFile = 'page frontmatter',
): CompiledPage {
	const tree = parser.parse(raw) as Root;
	let meta: Record<string, string> = {};
	const blocks: PageBlock[] = [];
	const bodyNodes: RootContent[] = [];

	for (const node of tree.children) {
		if (node.type === 'yaml') {
			meta = (parseYaml(node.value) ?? {}) as Record<string, string>;
			assertFrontmatterHasNoTranslatorNotes(meta, sourceFile);
			continue;
		}
		bodyNodes.push(node);
		blocks.push(
			node.type === 'paragraph'
				? { type: 'p', segments: inlineSegments(node, newTabNote, sourceFile) }
				: { type: 'html', html: proseHtml(node, newTabNote, sourceFile) },
		);
	}

	const body = stringifier
		.stringify({ type: 'root', children: lowerDirectives(bodyNodes, sourceFile) } as Root)
		.trim();
	return { meta, blocks, body };
}

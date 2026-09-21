<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, line, radius, text, tracking, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the article shell. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css/authoring.md.
	 *
	 * The scoped block at the foot of this file styles the markdown compiler's prose output and
	 * a little geometry beside it -- see spec/todo.md, "The article body's typography reaches
	 * elements no component renders". See spec/architecture/css/authoring.md, "A comment in the
	 * module script cannot write a tag in angle brackets", for why this block itself must not.
	 */
	const styles = stylex.create({
		title: {
			color: 'var(--color-text-strong)',
		},
		/**
		 * Never seen in production, so it spends nothing on being pretty: it has to be unmissable
		 * next to a title and it has to not be mistaken for part of one. What aligns it to the
		 * middle of the title's own line box is layout and stays below with the rest of its box.
		 */
		draftMark: {
			borderRadius: radius.sm,
			backgroundColor: 'var(--color-paper-hover)',
			fontSize: text.px12,
			fontWeight: weight.medium,
			// unnamed: the title's own line box, matched so the mark centres on it. Not a step.
			lineHeight: '1.5rem',
			letterSpacing: tracking.caps,
			color: 'var(--color-text-soft)',
			textTransform: 'uppercase',
		},
		meta: {
			color: 'var(--color-text-soft)',
		},
		/**
		 * The disclosure while there is nothing to disclose: `opacity` and `cursor` on
		 * `:disabled`, and the surface's own hover answer taken back where a pointer can hover.
		 *
		 * Repeats `surfaces.quietControl`'s `cursor`, `backgroundColor` and `color` rather than
		 * composing past them -- see spec/architecture/css/extraction.md, "The merge unit is the
		 * property, not the property and its condition". The suppression still outranks that hover:
		 * StyleX doubles the class this deep, `.x.x:disabled:hover` against a plain `.x:hover`.
		 */
		summaryTrigger: {
			// The one `cursor` left in this layer that is not a surface's own declaration, and it
			// is here because it overrides one. `surfaces.quietControl` is on this element and
			// brings `cursor: pointer`, so a `cursor-not-allowed` written in the markup would be
			// outranked by that surface rather than replace it -- the frame loses to the
			// vocabulary. Every other per-component `cursor` moved to the markup; see
			// spec/architecture/css/layers.md.
			cursor: { default: 'pointer', ':disabled': 'not-allowed' },
			opacity: { default: null, ':disabled': 0.45 },
			backgroundColor: {
				default: null,
				':hover': 'var(--color-paper-hover)',
				':focus-visible': 'var(--color-paper-hover)',
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the suppression from latching on after a tap.
				'@media (hover: hover)': { default: null, ':disabled:hover': 'transparent' },
			},
			color: {
				default: 'var(--color-text-soft)',
				':hover': 'var(--color-text-strong)',
				':focus-visible': 'var(--color-text-strong)',
				'@media (hover: hover)': {
					default: null,
					':disabled:hover': 'var(--color-text-soft)',
				},
			},
		},
		/**
		 * The summary's opening, which is motion and belongs here; the two rows it runs between
		 * are `grid-template-rows` and stay below, one behind an attribute selector this same
		 * element has no class to stand in for -- the same split code-block.svelte makes for its
		 * copy icons.
		 *
		 * Reduced motion replaces the block's old `transition: none`: the shorthand also resets
		 * duration and curve, which the four longhands here must do explicitly.
		 */
		summaryShell: {
			transitionProperty: {
				default: 'grid-template-rows',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '320ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: 'cubic-bezier(0.22, 1, 0.36, 1)',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
		},
		summaryPanel: {
			borderLeftWidth: border.doublePx,
			// The strong border colour lands on all four edges and only one of them has width, so
			// the shorthand is what keeps the computed style the same on the other three.
			borderColor: 'var(--color-border-strong)',
			fontSize: text.px14,
			// The relaxed line overrides the one the fourteen-pixel step would have set. It stays
			// a ratio: 1.625 is exact, and the rule against ratios is about the ones whose decimal
			// expansion does not stop.
			lineHeight: line.relaxed,
			color: 'var(--color-text-soft)',
		},
		/** The prose's own size and line. What they reach is the compiler's markup, below. */
		body: {
			fontSize: text.px15,
			lineHeight: line.relaxed,
		},
		/**
		 * The rule the subscription invitation opens on. It belongs to this placement rather than
		 * to the newsletter -- see spec/styling/controls.md -- so it arrives through that component's
		 * `class` prop, which lands on a section carrying no visual layer of its own.
		 */
		tail: {
			borderTopWidth: border.hairlinePx,
			borderColor: 'var(--color-border)',
		},
		/** Dashed where the article itself is what ended: offered rather than fenced off. */
		tailDashed: {
			borderStyle: 'dashed',
		},
	});

	/**
	 * What the article body's class resolves to, for a measurement taken before it is on screen.
	 *
	 * A heading is `600` because of its own class and its size because of this one, so the rail's
	 * measurement needs both. Exported rather than re-declared, because two places agreeing about
	 * a font is exactly how they stop agreeing. See lib/article/rail-measure.ts.
	 */
	export const ARTICLE_BODY_CLASS = stylex.attrs(styles.body).class ?? '';
</script>

<script lang="ts">
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { pageUrls } from '@canmi/urls';
	import { site } from '$lib/site';
	import BookOpenText from '@lucide/svelte/icons/book-open-text';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Type from '@lucide/svelte/icons/type';
	import IconClaude from '~icons/mingcute/claude-line';
	import IconGemini from '~icons/mingcute/google-gemini-line';
	import IconOpenAi from '~icons/mingcute/openai-line';
	import { remFromMeasuredPixels } from '$lib/client/units';
	import * as m from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';
	import type {
		Alternate,
		ArticleMeta,
		ArticleNote,
		ArticleSummary,
		TocEntry,
	} from '@canmi/artifacts/types';
	import type { Theme } from '@canmi/theme';
	import type { LocaleCode } from '$lib/locale';
	import LanguageSwitcher from '$lib/locale/switcher.svelte';
	import { warmView } from '$lib/published';
	import { CARD_HEIGHT, CARD_WIDTH, cardUrl } from '$lib/opengraph';
	import Newsletter from '$lib/newsletter/newsletter.svelte';
	import Footnotes from './footnotes.svelte';
	import { createReadsQuery } from '$lib/engagement/reads.svelte';
	import { formatCompact } from './format';
	import ActionBar from './action-bar.svelte';
	import HomeLink from './home-link.svelte';
	import type { RailWidths } from './rail-widths';
	import Toc from './toc.svelte';
	import TranslationNotice from './translation-notice.svelte';
	import IconXai from './xai-icon.svelte';
	import { shortDate } from '$lib/format';

	type ArticleLocale = {
		code: LocaleCode;
		tag: string;
		canonical: string;
		alternates: Alternate[];
		translated: boolean;
	};

	let {
		slug,
		card: cardId,
		meta,
		phone_title,
		toc,
		rail,
		words,
		reads: served,
		summary,
		locale,
		theme,
		notes = [],
		children,
	}: {
		/** The article's identity, which is what the read counter is keyed by. */
		slug: string;
		/** The content id of this view's OpenGraph card, when one has been drawn. */
		card?: string;
		meta: ArticleMeta;
		/** The title a phone sees: `meta.title` where it fits the column, the short one where it
		 *  does not. Decided in the build; see $lib/content/build/width.ts. */
		phone_title: string;
		toc: TocEntry[];
		/** What the rail's bars measure, when the load already knew. See toc.svelte. */
		rail?: RailWidths;
		/** How long the article is in the view being read. Body prose only -- see ArticleView. */
		words: number;
		/**
		 * How many have read it, as the load found out -- absent when the API would not say.
		 *
		 * The figure to draw until this reader's own visit has been recorded, which is a thing
		 * only the browser can do. See spec/engagement.md.
		 */
		reads?: number;
		/** The selected locale, or its English fallback. Absent only when neither exists. */
		summary?: ArticleSummary;
		locale: ArticleLocale;
		/** What the document is painted in, settled on the server beside the class. */
		theme: Theme;
		/** Collected author's notes, rendered after the article's closing rule. */
		notes?: ArticleNote[];
		children: Snippet;
	} = $props();

	const urls = pageUrls(dev);
	const SUMMARY_PROVIDERS = {
		anthropic: { icon: IconClaude, name: 'Anthropic' },
		google: { icon: IconGemini, name: 'Google Gemini' },
		openai: { icon: IconOpenAi, name: 'OpenAI' },
		xai: { icon: IconXai, name: 'xAI' },
	} as const;

	const reads = createReadsQuery(
		() => slug,
		() => served,
	);
	const readCount = $derived(reads.data?.read_count);

	let summaryOpen = $state(false);
	const summaryProvider = $derived(
		summary ? SUMMARY_PROVIDERS[summary.provider as keyof typeof SUMMARY_PROVIDERS] : undefined,
	);
	const SummaryProviderIcon = $derived(summaryProvider?.icon);
	// One call only -- `$props.id()` may not be used twice in a component -- so the pair is
	// derived from a single stable base.
	const summaryId = $props.id();
	const summaryTrigger = `${summaryId}-trigger`;
	const summaryPanel = `${summaryId}-panel`;

	/**
	 * The card for this article, at a URL nothing had to be told.
	 *
	 * Named by the answer rather than derived from the route: a card is a content-addressed object
	 * now, so an edited title draws a new one at a new address instead of overwriting this. That is
	 * what lets it keep a year. A view published before its card was drawn simply has none.
	 * See spec/architecture/media.md.
	 */
	const card = $derived(cardUrl(urls.cdn, cardId));

	/**
	 * A JSON-LD block, safe to drop into markup.
	 *
	 * Every `<` in the payload becomes `\u003c`, and the closing tag is assembled rather than
	 * written, so no `</script` sequence exists anywhere here. A tokenizer scanning for one does
	 * not care that it sits inside a string, and neither case stays hypothetical once this data
	 * includes text written by something other than us.
	 */
	function ldJson(data: unknown): string {
		const json = JSON.stringify(data).replaceAll('<', String.raw`\u003c`);
		return `<script type="application/ld+json">${json}</${'script'}>`;
	}

	/** A grapheme cluster whose base is a letter, which is the only ink this anchor is read off. */
	const LETTER_BASE = /^\p{L}/u;

	/**
	 * Anchor the mark to the rightmost ink in the summary, through the widest line's last letter.
	 *
	 * The browser has already broken this paragraph, so its boxes are read back rather than
	 * modelled: within a line `right` grows along the text, so the maximum over every letter is
	 * already the maximum over lines of each line's last letter, and punctuation never enters one.
	 * See spec/styling/lengths.md, "A summary provider mark aligns with the summary's widest line".
	 */
	function alignSummaryProvider(node: HTMLParagraphElement) {
		let frame = 0;
		// A range offset counts UTF-16 units, so a letter outside the BMP is two of them and the
		// cluster is what carries its combining marks. A range splitting one has engine-dependent
		// rects; a range over a whole one does not.
		const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
		const align = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const mark = node.querySelector<HTMLElement>('[data-summary-provider]');
				if (!mark) return;

				const probe = document.createRange();
				let anchor = Number.NEGATIVE_INFINITY;
				for (const child of node.childNodes) {
					// The mark is this paragraph's only element child and its last, so stopping at it is
					// what keeps the float out of the walk.
					if (child === mark) break;
					if (child.nodeType !== Node.TEXT_NODE) continue;
					for (const { segment, index } of graphemes.segment(child.textContent ?? '')) {
						if (!LETTER_BASE.test(segment)) continue;
						probe.setStart(child, index);
						probe.setEnd(child, index + segment.length);
						for (const rect of probe.getClientRects()) anchor = Math.max(anchor, rect.right);
					}
				}
				// No boxes at all means the paragraph is not being laid out, and an inset written from
				// nothing is a wrong one.
				if (anchor === Number.NEGATIVE_INFINITY) return;

				const box = node.getBoundingClientRect();
				const markWidth = mark.getBoundingClientRect().width;
				const inset = Math.min(Math.max(0, box.right - anchor), Math.max(0, box.width - markWidth));
				mark.style.marginInlineEnd = remFromMeasuredPixels(inset);
			});
		};

		const resize = new ResizeObserver(align);
		const content = new MutationObserver(align);
		resize.observe(node);
		content.observe(node, { childList: true, characterData: true, subtree: true });
		align();
		return {
			destroy() {
				cancelAnimationFrame(frame);
				resize.disconnect();
				content.disconnect();
			},
		};
	}

	/** What this page is, for a reader that parses rather than renders. */
	const article = $derived({
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: meta.title,
		description: meta.description,
		image: card,
		datePublished: meta.published,
		dateModified: meta.lastmod,
		inLanguage: locale.tag,
		mainEntityOfPage: locale.canonical,
		author: { '@type': 'Person', name: site.author.name },
	});

	// Pin UTC so the shown day matches the authored frontmatter date everywhere it
	// renders, mirroring the article list (see card.svelte).
	const date = $derived(shortDate(meta.published));

	/**
	 * The Markdown twin of this page.
	 *
	 * Taken from the canonical's path rather than the canonical itself: a translated view's
	 * canonical carries `?lang=`, and the document is a hook that replaces the extension on the
	 * path alone -- see hooks.server.ts and spec/locale/addressing.md, "Every page negotiates;
	 * the exceptions are documents".
	 */
	const markdown = $derived.by(() => {
		const { origin, pathname } = new URL(locale.canonical);
		return `${origin}${pathname}.md`;
	});
</script>

<svelte:head>
	<title>{meta.title}: {meta.subtitle}</title>
	<meta name="description" content={meta.description} />

	<meta property="og:type" content="article" />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={locale.canonical} />
	<meta property="og:locale" content={locale.tag} />
	<!-- Absent rather than empty when no card has been drawn yet: a crawler reading an empty
	     og:image draws a broken box, where one reading none falls back to the page. -->
	{#if card}
		<meta property="og:image" content={card} />
		<!-- Stated because a crawler that reserves the box before fetching draws it right. -->
		<meta property="og:image:width" content={CARD_WIDTH} />
		<meta property="og:image:height" content={CARD_HEIGHT} />
		<meta property="og:image:alt" content={meta.title} />
	{/if}
	<meta property="article:published_time" content={meta.published} />

	<!-- The document does not negotiate, so on a translated view the twin is in another language
	     than the page: `hreflang` says so, `type` says it is a reformulation, and the two stand
	     together. See spec/locale/addressing.md, "Every page negotiates; the exceptions are
	     documents". -->
	<link rel="alternate" type="text/markdown" hreflang={meta.lang} href={markdown} />

	<!-- `summary_large_image` is what makes X render the card at full width rather than as a
	     thumbnail beside the text, which is the only shape this layout is drawn for. -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
	<meta name="twitter:image" content={card} />

	<!-- Safe despite the raw insertion: ldJson escapes what it serialises. Stated rather than
	     suppressed; see +layout.svelte and spec/lint-format.md. -->
	{@html ldJson(article)}
</svelte:head>

<main class="min-h-screen {stylex.attrs(surfaces.page).class}">
	<!-- One rail, one box. It is fit-content, so the browser sizes it to the entries without
	     anything having to measure them -- see spec/styling/rail.md. A drag started on a heading
	     here should not come away with the navigation, so the apparatus does not select. -->
	<div class="article-rail select-none">
		<Toc {toc} {rail} />
		<HomeLink locale={locale.code} />
	</div>
	<!-- The mirror of that rail, down the region on the other side. What a reader does with an
	     article rather than what it is; see the component for why it declares no width. -->
	<ActionBar locale={locale.code} {theme} />
	<!-- The top is computed from the column's own side gutter and lives in `.article-column`; see
	     spec/styling/rail.md. The bottom keeps its 6rem at every width, because the space under the
	     footer competes with nothing. -->
	<div class="article-column px-6 pb-24">
		<article>
			<header>
				<!-- Inside the heading rather than beside it. A wrapper would exist on every article to
				     serve the few that are drafts, and the side rail measures this very box to place the
				     return control -- so a published article renders exactly the markup it did before,
				     because the branch below produces nothing at all. See spec/drafts.md. -->
				<!-- Two headings, one shown: see spec/styling/phone.md, "A phone is shown the title
				     that fits, not the title cut short", for why and how CSS picks between them. -->
				<h1 class="max-sm:hidden {stylex.attrs(styles.title).class}">
					{meta.title}{#if meta.draft}<span
							class="ms-2 inline-block px-[0.4375rem] align-middle {stylex.attrs(styles.draftMark)
								.class}"
						>
							{m['article.draft']({}, { locale: locale.code })}
						</span>{/if}
				</h1>
				<h1 class="sm:hidden {stylex.attrs(styles.title).class}">
					{phone_title}{#if meta.draft}<span
							class="ms-2 inline-block px-[0.4375rem] align-middle {stylex.attrs(styles.draftMark)
								.class}"
						>
							{m['article.draft']({}, { locale: locale.code })}
						</span>{/if}
				</h1>
				<!-- Apparatus rather than article, so it does not select either; the body and its own
				     controls are left alone deliberately, and the date inside takes selection back with
				     `select-text`. Quoting a passage is the reason this page exists. -->
				<div
					class="meta mt-2 flex flex-wrap items-center gap-2 max-sm:gap-x-1.5 select-none {stylex.attrs(
						surfaces.uiText,
						styles.meta,
					).class}"
				>
					<time class="select-text" datetime={meta.published}>{date}</time>
					<span
						class="inline-flex items-center gap-1"
						title="{words.toLocaleString('en-US')} words"
						aria-label="{words.toLocaleString('en-US')} words"
					>
						<Type class="size-3.5" aria-hidden="true" />
						{formatCompact(words)}
					</span>
					<!-- Absent when there is no count, rather than held open at a guessed width:
					     the width it would need is the rendered width of a figure nobody has.
					     Normally there is one from the first frame, because the load asks -- what
					     is left here is the API being unreachable. The figure then goes up by one
					     when this reader's own visit is recorded, which is the one thing a server
					     genuinely cannot do. See spec/engagement.md. -->
					{#if readCount != null}
						<!-- Absent below `sm` as well, and that is a second decision. The row is four
						     controls and a date, which is one line on a laptop and two on a phone; the
						     read count is the only one a reader never acts on, so it is the one that
						     goes. See spec/styling/phone.md. -->
						<span
							class="inline-flex items-center gap-1 max-sm:hidden"
							title="{readCount} reads"
							aria-label="{readCount.toLocaleString('en-US')} reads"
						>
							<BookOpenText class="size-3.5" aria-hidden="true" />
							{formatCompact(readCount)}
						</span>
					{/if}
					<!-- A disclosure, not a menu: it is deliberately not dismissed by clicking
					     elsewhere, because a reader comparing the summary against the article is
					     doing exactly that -- clicking elsewhere. Only the trigger closes it. The
					     disabled control keeps this metadata row stable while generated copy is absent. -->
					<button
						type="button"
						id={summaryTrigger}
						disabled={!summary}
						aria-expanded={summary ? summaryOpen : false}
						aria-controls={summary ? summaryPanel : undefined}
						onclick={() => {
							if (summary) summaryOpen = !summaryOpen;
						}}
						class="-mx-1 inline-flex items-center px-1 py-0.5 {stylex.attrs(
							surfaces.quietControl,
							surfaces.focusRingHost,
							styles.summaryTrigger,
						).class}"
					>
						<span
							class="focus-link-inner inline-flex items-center gap-1 {stylex.attrs(
								surfaces.focusLinkInner,
							).class}"
						>
							<Sparkles class="size-3.5" aria-hidden="true" />
							<span class="max-sm:hidden">{m['article.summary']({}, { locale: locale.code })}</span>
							<span class="sm:hidden"
								>{m['article.summary.short']({}, { locale: locale.code })}</span
							>
						</span>
					</button>
					<span class="meta-language">
						<LanguageSwitcher
							code={locale.code}
							sourceLanguage={meta.lang}
							phoneRegion={false}
							framed
							prefetch={(next) => warmView(slug, next)}
						/>
					</span>
				</div>
				{#if locale.code !== 'mw'}
					<TranslationNotice
						code={locale.code}
						sourceLanguage={meta.lang}
						available={locale.translated}
						prefetch={(next) => warmView(slug, next)}
					/>
				{/if}
				{#if summary}
					<!-- Rows collapse to 0fr rather than the box to height 0, which is the one way to
					     animate to a height nobody measured. See spec/architecture/media.md on motion. -->
					<!-- The two rows are a ternary rather than a base utility and a variant over it: one
					     property in one layer, whose order is not the author's to choose. See
					     spec/architecture/css/migration.md. -->
					<div
						class="grid {summaryOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'} {stylex.attrs(
							styles.summaryShell,
						).class}"
						data-open={summaryOpen}
					>
						<div class="overflow-hidden">
							<div
								id={summaryPanel}
								role="region"
								aria-labelledby={summaryTrigger}
								class="mt-3 pr-3 pl-3 {stylex.attrs(styles.summaryPanel).class}"
							>
								<!-- The summary is body prose and breaks its lines by the body's rules, which is
								     the class rather than a second copy of them. See spec/styling/prose.md,
								     "Where a line ends is declared per language". -->
								<p class="article-summary" use:alignSummaryProvider>
									{summary.text}
									{#if SummaryProviderIcon && summaryProvider}
										<span
											data-summary-provider
											class="float-right mt-0.75 ml-2 block h-4"
											aria-label={summaryProvider.name}
											title={summaryProvider.name}
										>
											<SummaryProviderIcon class="h-4 w-auto" aria-hidden="true" />
										</span>
									{/if}
								</p>
							</div>
						</div>
					</div>
				{/if}
			</header>

			<div class="article-body mt-8 {stylex.attrs(styles.body).class}">
				{@render children()}
			</div>
		</article>

		<!-- The dashed rule that opens whatever follows the article is the article's closing
		     boundary: dashed because what follows is offered rather than fenced off. With notes
		     it sits on the notes section, which is about the article rather than part of it --
		     which is also why the rail and the table of contents never see the notes. The plain
		     rule between the notes and the newsletter then only separates two offerings.
		     See spec/styling/notes.md. -->
		{#if notes.length > 0}
			<Footnotes {notes} locale={locale.code} />
			<!-- Closer than the article's own gap: the notes are small, quiet apparatus, and the
			     distance that reads as a pause after prose reads as a hole after them. -->
			<Newsletter offer locale={locale.code} class="mt-8 pt-12 {stylex.attrs(styles.tail).class}" />
		{:else}
			<Newsletter
				offer
				locale={locale.code}
				class="mt-16 pt-12 {stylex.attrs(styles.tail, styles.tailDashed).class}"
			/>
		{/if}
	</div>
</main>

<style>
	.article-body :global(strong) {
		font-weight: 500;
		color: var(--color-text-strong);
	}

	.article-body :global(s) {
		color: var(--color-text-soft);
	}

	/* A note's marker. It rides above the line it interrupts and stays smaller than the words
	   around it: a reader following the sentence should be able to pass over it, and a reader
	   looking for it should find it without hunting. Global because prose markers arrive as
	   compiled HTML while a heading's are written by section.svelte -- one appearance, two
	   origins, and one address now that both write it. See spec/styling/notes.md. */
	.article-body :global([data-note-marker]) {
		/* Relative, so one ratio serves both places a marker appears: beside prose it lands where
		   the absolute 0.6875rem used to, and in the smaller notes below it shrinks with them. */
		font-size: 0.73em;
		font-variant-numeric: tabular-nums;
		line-height: 0;
	}

	.article-body :global([data-note-marker-link]) {
		padding-inline: 0.0625rem;
		color: var(--color-text-soft);
		text-decoration: none;
		transition: color 200ms ease-out;
	}

	.article-body :global([data-note-marker-link]:hover),
	.article-body :global([data-note-marker-link]:focus-visible) {
		color: var(--color-text-strong);
	}

	@media (prefers-reduced-motion: reduce) {
		.article-body :global([data-note-marker-link]) {
			transition: none;
		}
	}

	/* The marker's own tint for a walk back, keyed off the class note-flash.ts sets on the noted
	   words -- see spec/styling/notes.md, "The walk back from a note lights the words it lands on",
	   for the overlay itself. Under reduced motion the tint simply is: the information is kept,
	   the animation is not. */

	/* .note-return stays a class: a script adds it at runtime, so no published article carries one
	   and there is nothing to migrate. One arm per shape lit -- in prose the words are flashed and
	   the marker follows them, in a heading there are no wrapped words and the marker is flashed
	   itself. */
	.article-body :global(.note-return + [data-note-marker] [data-note-marker-link]),
	.article-body :global([data-note-marker].note-return [data-note-marker-link]) {
		animation: note-return-marker 1.8s ease-out both;
	}

	@keyframes -global-note-return-marker {
		0% {
			color: var(--color-text-soft);
		}
		7%,
		67% {
			color: var(--color-text-strong);
		}
		100% {
			color: var(--color-text-soft);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.article-body :global(.note-return + [data-note-marker] [data-note-marker-link]),
		.article-body :global([data-note-marker].note-return [data-note-marker-link]) {
			animation: none;
			color: var(--color-text-strong);
		}
	}

	/* A spoiler keeps its words in the line but out of view until asked: fogged by blur, lifted
	   while hovered or focused, restored when the reader moves away. `:focus`, not
	   `:focus-visible` -- a tap's focus is the only reveal a touch screen has, and revealing is
	   the element's whole job, unlike the ring, which stays keyboard-only via .focus-link.
	   See spec/styling/notes.md. */
	.article-body :global([data-spoiler]) {
		border-radius: 0.25rem;
		cursor: pointer;
		filter: blur(0.28em);
		transition: filter 200ms ease-out;
	}

	.article-body :global([data-spoiler]:hover),
	.article-body :global([data-spoiler]:focus) {
		filter: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.article-body :global([data-spoiler]) {
			transition: none;
		}
	}

	/* A quoted source is a prose inset, not an authored callout. See spec/styling/prose.md. */
	.article-body :global(blockquote) {
		padding: 1rem 1.125rem 1rem 1.375rem;
		border-left: 0.125rem solid var(--color-border-strong);
		border-radius: 0 0.625rem 0.625rem 0;
		background: var(--color-paper-hover);
		color: var(--color-text-strong);
	}

	.article-body :global(blockquote > p + p) {
		margin-top: 0.75rem;
	}

	.article-body :global(hr) {
		width: 18.75%;
		height: 0.125rem;
		margin: 2.5rem auto;
		border: 0;
		background: linear-gradient(
			to right,
			var(--color-border-strong) 0 12%,
			transparent 12% 22%,
			var(--color-border-strong) 22% 34%,
			transparent 34% 44%,
			var(--color-border-strong) 44% 56%,
			transparent 56% 66%,
			var(--color-border-strong) 66% 78%,
			transparent 78% 88%,
			var(--color-border-strong) 88% 100%
		);
	}

	.article-body :global(code:not(pre code)) {
		box-shadow: inset 0 0 0 0.0625rem var(--color-border-strong);
		border-radius: 0.375rem;
		background: var(--color-paper);
		padding: 0.125rem 0.375rem;
		font-size: 0.875rem;
	}

	/* A table the markdown compiler wrote, reached from here because it carries no class -- which
	   is question one's answer in spec/architecture/css/layers.md.

	   `border-collapse: separate` is what lets the frame keep its corner: collapsing merges the
	   outer border into the cells' and the radius then clips a line that is no longer there. Cell
	   borders go on two edges only, so no interior line is drawn twice. */
	.article-body :global(table) {
		width: 100%;
		border-width: 1px;
		border-style: solid;
		border-color: var(--color-border);
		border-radius: 0.75rem;
		border-spacing: 0;
		border-collapse: separate;
		overflow: hidden;
	}

	/* Three grounds, counting the page the frame sits on. The head takes `paper` and the body the
	   step beyond it, so the rows carry the weight and the head reads as their label. */
	.article-body :global(tbody) {
		background-color: var(--color-paper-hover);
	}

	.article-body :global(thead) {
		background-color: var(--color-paper);
	}

	.article-body :global(th),
	.article-body :global(td) {
		border-inline-end: 1px solid var(--color-border);
		border-block-end: 1px solid var(--color-border);
		padding-block: 0.625rem;
		padding-inline: 0.875rem;
		text-align: start;
		vertical-align: baseline;
		overflow-wrap: break-word;
	}

	/* The frame already draws the last column's right edge and the last row's bottom, so the cells
	   there stop short of doubling it. */
	.article-body :global(tr > :last-child) {
		border-inline-end: 0;
	}

	.article-body :global(tbody tr:last-child > *) {
		border-block-end: 0;
	}

	/* A heading at the weight and ink this prose already gives a `strong`, rather than the bold a
	   `th` renders at by default. */
	.article-body :global(th) {
		font-weight: 500;
		color: var(--color-text-strong);
	}
</style>

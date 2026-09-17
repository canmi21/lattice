<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, line, radius, text, weight } from '$lib/vocabulary.stylex.ts';

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
		/**
		 * The apparatus around the article, not the article: a drag started on a heading in the
		 * table of contents, or on the way back, should not come away with the navigation. The
		 * body and its own controls are left alone deliberately -- quoting a passage is the
		 * reason this page exists. Visual under spec/architecture/css/layers.md: it moves nothing, it
		 * says what the element is to a pointer.
		 */
		apparatus: {
			userSelect: 'none',
		},
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
			lineHeight: '1.5rem',
			letterSpacing: '0.02em',
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
			// Visual under the rule in spec/architecture/css/layers.md: it moves nothing, it says what
			// the element is to a pointer.
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
			// `border-border-strong` colours all four edges and only one of them has width, so
			// the shorthand is what keeps the computed style the same on the other three.
			borderColor: 'var(--color-border-strong)',
			fontSize: text.px14,
			// `leading-relaxed` overrides the line `text-sm` would have set. It stays a ratio:
			// 1.625 is exact, and the rule against ratios is about the ones whose decimal
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
	import { layoutWithLines, measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext';
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
	import type { LocaleCode } from '$lib/locale';
	import LanguageSwitcher from '$lib/locale/switcher.svelte';
	import { warmView } from '$lib/published';
	import { CARD_HEIGHT, CARD_WIDTH, cardUrl } from '$lib/opengraph';
	import Newsletter from '$lib/newsletter/newsletter.svelte';
	import Footnotes from './footnotes.svelte';
	import { createReadsQuery } from '$lib/engagement/reads.svelte';
	import { formatCompact } from './format';
	import HomeLink from './home-link.svelte';
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
		meta,
		phone_title,
		toc,
		words,
		summary,
		locale,
		notes = [],
		children,
	}: {
		/** The article's path, which is what the read counter is keyed by. */
		slug: string;
		meta: ArticleMeta;
		/** The title a phone sees: `meta.title` where it fits the column, the short one where it
		 *  does not. Decided in the build; see $lib/content/build/width.ts. */
		phone_title: string;
		toc: TocEntry[];
		/** How long the article is in the view being read. Body prose only -- see ArticleView. */
		words: number;
		/** The selected locale, or its English fallback. Absent only when neither exists. */
		summary?: ArticleSummary;
		locale: ArticleLocale;
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

	const reads = createReadsQuery(() => slug);
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
	 * `cms og` writes one card per article under the same path the article has, so the address
	 * follows from the route and no reference is stored anywhere. The cost is that the name is
	 * mutable -- an edited title reuses this URL -- which is why the CDN serves these for a
	 * week rather than a year. See spec/architecture/media.md.
	 */
	const card = $derived(cardUrl(urls.cdn, page.url.pathname, locale.code));

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

	/**
	 * Follow the last letter on the rendered reference line, not its trailing punctuation.
	 *
	 * A wrapped line can stop short by a word or several CJK glyphs, and CSS exposes no value for
	 * that ink width. Pretext applies the browser's line-breaking rules to exact canvas metrics;
	 * the mark stays in flow and measurement only supplies the inset wrapping cannot express.
	 * See spec/styling/lengths.md.
	 */
	function alignSummaryProvider(node: HTMLParagraphElement) {
		let frame = 0;
		let prepared: ReturnType<typeof prepareWithSegments> | undefined;
		let preparedText = '';
		let preparedFont = '';
		let preparedLetterSpacing = 0;
		const align = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const mark = node.querySelector<HTMLElement>('[data-summary-provider]');
				const text = Array.from(node.childNodes)
					.filter((child) => child.nodeType === Node.TEXT_NODE)
					.map((child) => child.textContent ?? '')
					.join('')
					.trim();
				if (!mark || !text) return;

				const style = getComputedStyle(node);
				const parsedLetterSpacing = Number.parseFloat(style.letterSpacing);
				const letterSpacing = Number.isFinite(parsedLetterSpacing) ? parsedLetterSpacing : 0;
				if (
					!prepared ||
					preparedText !== text ||
					preparedFont !== style.font ||
					preparedLetterSpacing !== letterSpacing
				) {
					prepared = prepareWithSegments(text, style.font, { letterSpacing });
					preparedText = text;
					preparedFont = style.font;
					preparedLetterSpacing = letterSpacing;
				}

				const width = node.clientWidth;
				const lineHeight = Number.parseFloat(style.lineHeight);
				const lines = layoutWithLines(prepared, width, lineHeight).lines;
				const last = lines.at(-1);
				if (!last) return;

				const markWidth = mark.getBoundingClientRect().width;
				const startMargin = Number.parseFloat(getComputedStyle(mark).marginInlineStart) || 0;
				const widthThroughLastLetter = (line: (typeof lines)[number]) => {
					const throughLastLetter = line.text.match(/^.*\p{L}\p{M}*/u)?.[0];
					return throughLastLetter
						? measureNaturalWidth(
								prepareWithSegments(throughLastLetter, style.font, { letterSpacing }),
							)
						: line.width;
				};
				const lastWidth = widthThroughLastLetter(last);
				const preceding = lines.at(-2);
				const precedingWidth = preceding ? widthThroughLastLetter(preceding) : undefined;
				const sharesLastLine =
					precedingWidth !== undefined && last.width + startMargin <= precedingWidth - markWidth;
				const anchorWidth = sharesLastLine ? precedingWidth : lastWidth;
				const inset = Math.min(Math.max(0, width - anchorWidth), Math.max(0, width - markWidth));
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
		datePublished: meta.created,
		dateModified: meta.lastmod,
		inLanguage: locale.tag,
		mainEntityOfPage: locale.canonical,
		author: { '@type': 'Person', name: site.author.name },
	});

	// Pin UTC so the shown day matches the authored frontmatter date everywhere it
	// renders, mirroring the article list (see card.svelte).
	const date = $derived(shortDate(meta.created));
</script>

<svelte:head>
	<title>{meta.title}: {meta.subtitle}</title>
	<meta name="description" content={meta.description} />

	<meta property="og:type" content="article" />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={locale.canonical} />
	<meta property="og:locale" content={locale.tag} />
	<meta property="og:image" content={card} />
	<!-- Stated because a crawler that reserves the box before fetching draws it right. -->
	<meta property="og:image:width" content={CARD_WIDTH} />
	<meta property="og:image:height" content={CARD_HEIGHT} />
	<meta property="og:image:alt" content={meta.title} />
	<meta property="article:published_time" content={meta.created} />

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
	     anything having to measure them -- see spec/styling/rail.md. -->
	<div class="article-rail {stylex.attrs(styles.apparatus).class}">
		<Toc {toc} />
		<HomeLink locale={locale.code} />
	</div>
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
							class="draft-mark {stylex.attrs(styles.draftMark).class}"
						>
							{m['article.draft']({}, { locale: locale.code })}
						</span>{/if}
				</h1>
				<h1 class="sm:hidden {stylex.attrs(styles.title).class}">
					{phone_title}{#if meta.draft}<span
							class="draft-mark {stylex.attrs(styles.draftMark).class}"
						>
							{m['article.draft']({}, { locale: locale.code })}
						</span>{/if}
				</h1>
				<div
					class="meta mt-2 flex flex-wrap items-center gap-2 max-sm:gap-x-1.5 {stylex.attrs(
						styles.apparatus,
						surfaces.uiText,
						styles.meta,
					).class}"
				>
					<time class="selectable" datetime={meta.created}>{date}</time>
					<span
						class="inline-flex items-center gap-1"
						title="{words.toLocaleString('en-US')} words"
						aria-label="{words.toLocaleString('en-US')} words"
					>
						<Type class="size-3.5" aria-hidden="true" />
						{formatCompact(words)}
					</span>
					<!-- Absent until the count arrives, rather than held open at a guessed width.
					     The server cannot know this number -- see spec/engagement.md -- and the
					     width it would need is the rendered width of a figure nobody has yet. A
					     returning reader is served the previous count out of the persisted query
					     cache and sees no movement at all. -->
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
							styles.summaryTrigger,
						).class}"
					>
						<span class="focus-link-inner inline-flex items-center gap-1">
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
					<div
						class="summary-shell {stylex.attrs(styles.summaryShell).class}"
						data-open={summaryOpen}
					>
						<div class="overflow-hidden">
							<div
								id={summaryPanel}
								role="region"
								aria-labelledby={summaryTrigger}
								class="mt-3 pr-3 pl-3 {stylex.attrs(styles.summaryPanel).class}"
							>
								<p use:alignSummaryProvider>
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
	/* Never seen in production, so it spends nothing on being pretty. What is left here is its
	   box: aligned to the middle of the title's own line box rather than its baseline, since it
	   is a label about the article and not a word of its name. */
	.draft-mark {
		display: inline-block;
		margin-inline-start: 0.5rem;
		padding-inline: 0.4375rem;
		vertical-align: middle;
	}

	/* Animating to `height: auto` is not possible, so the grid row is animated instead: 0fr to
	   1fr resolves against the content's own height without anyone measuring it. The child
	   needs `overflow: hidden` for the clip to happen. The animation between the two rows is
	   motion and sits in the visual layer at the head of this file; what stays is the open row,
	   which the visual layer has no way to ask about -- an attribute on this element is not a
	   class on it. */
	.summary-shell {
		display: grid;
		grid-template-rows: 0fr;
	}

	.summary-shell[data-open='true'] {
		grid-template-rows: 1fr;
	}

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
	   origins. See spec/styling/notes.md. */
	.article-body :global(.note-marker) {
		/* Relative, so one ratio serves both places a marker appears: beside prose it lands where
		   the absolute 0.6875rem used to, and in the smaller notes below it shrinks with them. */
		font-size: 0.73em;
		font-variant-numeric: tabular-nums;
		line-height: 0;
	}

	.article-body :global(.note-marker-link) {
		padding-inline: 0.0625rem;
		color: var(--color-text-soft);
		text-decoration: none;
		transition: color 200ms ease-out;
	}

	.article-body :global(.note-marker-link:hover),
	.article-body :global(.note-marker-link:focus-visible) {
		color: var(--color-text-strong);
	}

	@media (prefers-reduced-motion: reduce) {
		.article-body :global(.note-marker-link) {
			transition: none;
		}
	}

	/* The marker's own tint for a walk back, keyed off the class note-flash.ts sets on the noted
	   words -- see spec/styling/notes.md, "The walk back from a note lights the words it lands on",
	   for the overlay itself. Under reduced motion the tint simply is: the information is kept,
	   the animation is not. */
	.article-body :global(.note-return + .note-marker .note-marker-link),
	.article-body :global(.note-marker.note-return .note-marker-link) {
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
		.article-body :global(.note-return + .note-marker .note-marker-link),
		.article-body :global(.note-marker.note-return .note-marker-link) {
			animation: none;
			color: var(--color-text-strong);
		}
	}

	/* A spoiler keeps its words in the line but out of view until asked: fogged by blur, lifted
	   while hovered or focused, restored when the reader moves away. `:focus`, not
	   `:focus-visible` -- a tap's focus is the only reveal a touch screen has, and revealing is
	   the element's whole job, unlike the ring, which stays keyboard-only via .focus-link.
	   See spec/styling/notes.md. */
	.article-body :global(.spoiler) {
		border-radius: 0.25rem;
		cursor: pointer;
		filter: blur(0.28em);
		transition: filter 200ms ease-out;
	}

	.article-body :global(.spoiler:hover),
	.article-body :global(.spoiler:focus) {
		filter: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.article-body :global(.spoiler) {
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
</style>

<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import { ARTICLE_THUMBNAIL_LINES } from '@canmi/primitives';
	import { arriving } from '@canmi/behavior/arrival';
	import { shortDate } from '@canmi/locales/format';
	import { surfaces } from '@canmi/tokens/surfaces';

	let {
		title,
		subtitle,
		short_title,
		short_subtitle,
		published,
		path,
		bars,
		index,
	}: {
		title: string;
		subtitle: string;
		/** What a phone shows instead. Equal to the full form where none was written. */
		short_title: string;
		short_subtitle: string;
		published: string;
		path: string;
		/**
		 * The thumbnail's five bars, when somebody already knew them.
		 *
		 * Absent is a server that could not measure text, and the hand-tuned default stands in
		 * until the list settles it. Present is a browser that measured before this was drawn, and
		 * then the first frame is the answer. See spec/styling/first-paint.md.
		 */
		bars?: readonly { width: string; marginTop: string }[];
		/**
		 * Where this card sits in the homepage's list, which is how the head script names its bars.
		 *
		 * Absent for a card inside an article, which has no list to be measured against and keeps
		 * the baked shape. See article/body.svelte.
		 */
		index?: number;
	} = $props();

	/**
	 * Three answers, in the order they are known: the load's measurement, then what this sitting
	 * painted before anything rendered, then the hand-tuned default. The custom properties are
	 * only read on the document the reader arrived in -- the head script runs once, so they belong
	 * to the page that was served. See lib/client/measured-ground.ts.
	 */
	const settled = untrack(() => arriving());
	const lines = $derived(
		bars ??
			ARTICLE_THUMBNAIL_LINES.map((line, bar) =>
				settled && index !== undefined
					? {
							width: `var(--card-${index}-${bar}-w, ${line.width})`,
							marginTop: `var(--card-${index}-${bar}-g, ${line.marginTop})`,
						}
					: line,
			),
	);

	const date = $derived(shortDate(published));
</script>

<a href="/{path}" class="article-preview group {stylex.attrs(surfaces.focusRingHost).class}">
	<!-- A4-ish sheet. Five bars carry the hand-tuned first-frame widths/gaps; after
	hydration the article list measures the corpus and animates them to a content-derived
	shape (normalized list-wide, see list.svelte). -->
	<div
		data-article-icon
		aria-hidden="true"
		class="article-preview-thumbnail focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
	>
		{#each lines as line}
			<span data-icon-bar style:width={line.width} style:margin-top={line.marginTop}></span>
		{/each}
	</div>

	<!-- `select-text` on the four sentences below, and on nothing else here: the card is a control
	     and the home page switches selection off over the whole of itself, so a title or a subtitle
	     is a sentence a reader may quote while the leader and the date are furniture a drag should
	     not come away with. The date is deliberately not one of them. -->
	<div class="article-preview-copy">
		<!-- Title shares its line with the dotted leader and date, so the leader
		starts at the title's end rather than the (often longer) subtitle below. -->
		<div class="article-preview-heading">
			<!-- Both forms in the document, CSS choosing between them: see spec/styling/phone.md,
			     "A phone is shown the title that fits, not the title cut short". -->
			<h3 class="select-text article-preview-title max-sm:hidden">{title}</h3>
			<h3 class="select-text article-preview-title sm:hidden">{short_title}</h3>
			<div class="article-preview-leader"></div>
			<time datetime={published} class="article-preview-date">{date}</time>
		</div>
		<p class="select-text article-preview-subtitle max-sm:hidden">{subtitle}</p>
		<p class="select-text article-preview-subtitle sm:hidden">{short_subtitle}</p>
	</div>
</a>

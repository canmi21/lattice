<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, radius, text, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the translator's note, the only surface this component draws itself.
	 * Every colour is the token variable `libs/tokens` already declares, so nothing here can
	 * change one. See spec/architecture/css/authoring.md.
	 *
	 * The scoped block at the foot of this file does not shrink: every rule in it reaches
	 * `.tn-trigger`, a control the markdown compiler wrote into the prose, and a style reaches an
	 * element only through a class on that element.
	 */
	const styles = stylex.create({
		/** The note's header row, which carries the ink its icon and label inherit. */
		noteHead: {
			color: 'var(--color-text-soft)',
		},
		noteLabel: {
			fontSize: text.px12,
			// The line as a length rather than as the ratio `text-xs` writes it, `calc(1 / 0.75)`,
			// which is the same 1rem and cannot be written that way here: StyleX evaluates a calc
			// and keeps five decimals. See spec/architecture/css/authoring.md.
			lineHeight: '1rem',
			fontWeight: weight.medium,
		},
		noteClose: {
			// Visual under the rule in spec/architecture/css/layers.md: it moves nothing, it says what
			// the element is to a pointer.
			cursor: 'pointer',
			borderRadius: radius.sm,
			color: {
				default: 'var(--color-text-soft)',
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the colour from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
			backgroundColor: {
				default: null,
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-paper-hover)' },
			},
		},
		/**
		 * The rule between the header and the note. `border-t` drew one edge and `border-border`
		 * coloured all four, so the colour is written on all four here as well: the other three
		 * are zero-width and invisible, and they are still what the element computes.
		 */
		noteBody: {
			borderTopWidth: border.hairlinePx,
			borderTopStyle: 'solid',
			borderColor: 'var(--color-border)',
		},
	});
</script>

<script lang="ts">
	import Cargo from '$lib/blocks/cargo/cargo.svelte';
	import CodeBlock from '$lib/blocks/code-block.svelte';
	import GitHub from '$lib/blocks/github.svelte';
	import LinkCard from '$lib/blocks/link-card.svelte';
	import Picture from '$lib/components/picture.svelte';
	import Mermaid from '$lib/blocks/mermaid/mermaid.svelte';
	import Placeholder from '$lib/blocks/placeholder.svelte';
	import Quadrant from '$lib/blocks/quadrant.svelte';
	import SvgCanvas from '$lib/blocks/svg-canvas.svelte';
	import Tokei from '$lib/blocks/tokei/tokei.svelte';
	import Twitter from '$lib/blocks/twitter.svelte';
	import Video from '$lib/components/video.svelte';
	import { jumpTo, movesThisPage, targetOf } from '$lib/client/jump';
	import { flashOnArrival } from './note-flash';
	import { revealNoteBeforeJump } from './note-reveal';
	import PopoverContent from '$lib/components/popover-content.svelte';
	import * as m from '$lib/paraglide/messages';
	import Info from '@lucide/svelte/icons/info';
	import X from '@lucide/svelte/icons/x';
	import { Popover } from 'bits-ui';
	import type { Block } from '@canmi/artifacts/types';
	import type { LocaleCode } from '$lib/locale';
	import ArticleCard from './card.svelte';
	import Section from './section.svelte';

	let { blocks, locale }: { blocks: Block[]; locale: LocaleCode } = $props();
	let root = $state<HTMLElement>();
	let trigger = $state<HTMLButtonElement>();
	let note = $state('');
	let open = $state(false);
	let restoreFocusOnDismiss = false;

	function noteTrigger(target: EventTarget | null): HTMLButtonElement | undefined {
		if (!(target instanceof Element)) return undefined;
		const found = target.closest<HTMLButtonElement>('button[data-tn-note]');
		return found && root?.contains(found) ? found : undefined;
	}

	function closeNote(restoreFocus: boolean) {
		if (!trigger) return;
		trigger.setAttribute('aria-expanded', 'false');
		trigger.removeAttribute('aria-describedby');
		open = false;
		if (restoreFocus) trigger.focus();
	}

	function openNote(next: HTMLButtonElement) {
		if (trigger === next && open) {
			closeNote(true);
			return;
		}
		closeNote(false);
		trigger = next;
		note = next.dataset.tnNote ?? '';
		next.setAttribute('aria-expanded', 'true');
		next.setAttribute('aria-describedby', 'translator-note-description');
		open = true;
	}

	/**
	 * A note's marker and its way back, both of them scrolled rather than jumped.
	 *
	 * Delegated from the article root because a marker in prose arrives as compiled HTML and has
	 * no component to hang a handler on -- the same reason the translator's note above is handled
	 * here. One listener covers markers in prose, markers in headings and the links at the end.
	 */
	function noteJump(target: EventTarget | null): HTMLAnchorElement | undefined {
		if (!(target instanceof Element)) return undefined;
		// Markers only. The way back lives in the notes section, which renders outside this
		// root and owns its own clicks -- see footnotes.svelte.
		const found = target.closest<HTMLAnchorElement>('a.note-marker-link');
		return found && root?.contains(found) ? found : undefined;
	}

	function handleClick(event: MouseEvent) {
		const next = noteTrigger(event.target);
		if (next) {
			openNote(next);
			return;
		}
		const link = noteJump(event.target);
		if (!link || !movesThisPage(event)) return;
		const destination = targetOf(link);
		if (!destination) return;
		// The move is not an address: see spec/styling/notes.md.
		event.preventDefault();
		// Before the scroll, never after: a note behind the fold has to really be where it is
		// going to be by the time `scrollIntoView` resolves its destination. See note-reveal.ts.
		revealNoteBeforeJump(destination);
		jumpTo(destination);
		// Landing light for the walk down: the note's whole line, phrase and explanation
		// together, because they compose one sentence. See footnotes.svelte for its shape.
		const line = destination.querySelector('.note-line');
		if (line instanceof HTMLElement) flashOnArrival(line, 'ends');
	}

	function noteEvents(node: HTMLElement) {
		root = node;
		node.addEventListener('click', handleClick);
		return {
			destroy() {
				node.removeEventListener('click', handleClick);
				if (root === node) root = undefined;
			},
		};
	}

	function handleOpenChange(next: boolean) {
		if (next) {
			open = true;
			return;
		}
		closeNote(restoreFocusOnDismiss);
		restoreFocusOnDismiss = false;
	}

	function finishOpenChange(next: boolean) {
		if (next) return;
		trigger = undefined;
		note = '';
	}
	/**
	 * How far into an article a picture can be and still be worth a priority hint.
	 *
	 * Counted in blocks, because blocks are what exists here. Pixels would be the right unit and
	 * are not available: the hint has to be in the served HTML, and where the fold falls depends
	 * on a viewport the server has never seen. A picture within the first few blocks is above it
	 * on almost any screen; one further down is a guess in both directions.
	 */
	const ABOVE_THE_FOLD = 3;

	/**
	 * The one picture worth telling the browser about, or nothing. Every image is otherwise
	 * `loading="lazy"`, and a priority hint on everything is a hint on nothing -- a ranking with
	 * no bottom has no top.
	 *
	 * Clips are not candidates: `fetchpriority` is defined for `img`, `link`, `script` and
	 * `iframe`, and a media element's own fetches are not covered by it. `preload="metadata"` is
	 * the whole of what a clip's loading can be told.
	 */
	const lead = $derived.by(() => {
		const at = blocks.findIndex((block) => block.type === 'image');
		return at >= 0 && at < ABOVE_THE_FOLD ? at : -1;
	});
</script>

<div use:noteEvents class="article-content space-y-4">
	{#each blocks as block, i (i)}
		{#if block.type === 'prose'}
			<!-- Compiled at build time from the tracked corpus, not reader input. Stated rather
			     than suppressed; see spec/lint-format.md. -->
			{@html block.html}
		{:else if block.type === 'heading'}
			<Section slug={block.slug} depth={block.depth} notes={block.notes}>{block.text}</Section>
		{:else if block.type === 'code'}
			<CodeBlock
				label={block.label}
				title={block.title}
				collapsible={block.collapsible}
				defaultExpanded={block.defaultExpanded}
				copyLabel={m['code.copy']({}, { locale })}
				copiedLabel={m['code.copied']({}, { locale })}
				copyFailedLabel={m['code.copy-failed']({}, { locale })}
				code={block.code}
				html={block.html}
			/>
		{:else if block.type === 'mermaid'}
			<Mermaid
				source={block.source}
				ratio={block.ratio}
				description={block.description}
				loadingLabel={m['mermaid.loading']({}, { locale })}
			/>
		{:else if block.type === 'quadrant'}
			<Quadrant
				title={block.title}
				description={block.description}
				reading={block.reading}
				axes={block.axes}
				items={block.items}
			/>
		{:else if block.type === 'image'}
			<Picture
				{locale}
				enlarges
				src={block.src}
				alt={block.alt}
				width={block.width}
				height={block.height}
				preview={block.preview}
				srcset={block.srcset}
				crop={block.crop}
				align={block.align}
				eager={i === lead}
			/>
		{:else if block.type === 'video'}
			<Video
				{locale}
				src={block.src}
				rungs={block.rungs}
				width={block.width}
				height={block.height}
				poster={block.poster}
				preview={block.preview}
				captions={block.captions}
				description={block.description}
				source={block.source}
				gain={block.gain}
			/>
		{:else if block.type === 'linkcard'}
			<LinkCard
				{locale}
				src={block.src}
				url={block.url}
				title={block.title}
				tone={block.tone}
				width={block.width}
				height={block.height}
				preview={block.preview}
				srcset={block.srcset}
				crop={block.crop}
				align={block.align}
				description={block.description}
			/>
		{:else if block.type === 'article'}
			<!-- The homepage's row, unchanged, and navigating in place like every other link
			     here -- the reader's way back is the trail, see spec/styling/rail.md. Its thumbnail
			     keeps the baked first frame rather than the content-derived shape the homepage
			     animates to: that shape is normalised across a whole list, and one card in a body
			     has no list to be measured against. See $lib/article/list.svelte. -->
			<ArticleCard
				title={block.title}
				subtitle={block.subtitle}
				shortTitle={block.shortTitle}
				shortSubtitle={block.shortSubtitle}
				created={block.created}
				path={block.path}
			/>
		{:else if block.type === 'placeholder'}
			<Placeholder kind={block.kind} meta={block.meta} />
		{:else if block.type === 'svgCanvas'}
			<SvgCanvas svg={block.svg} {locale} description={block.description} />
		{:else if block.type === 'tokei'}
			<Tokei source={block.source} title={block.title} view={block.view} />
		{:else if block.type === 'cargo'}
			<Cargo crate={block.crate} view={block.view} />
		{:else if block.type === 'twitter'}
			<Twitter tweet={block.tweet} />
		{:else if block.type === 'github'}
			<GitHub repo={block.repo} gitRef={block.gitRef} title={block.title} align={block.align} />
		{/if}
	{/each}
</div>

<Popover.Root {open} onOpenChange={handleOpenChange} onOpenChangeComplete={finishOpenChange}>
	<PopoverContent
		anchor={trigger ?? null}
		id="translator-note"
		labelledby="translator-note-label"
		describedby="translator-note-description"
		onEscapeKeydown={() => (restoreFocusOnDismiss = true)}
		onInteractOutside={() => (restoreFocusOnDismiss = false)}
		onOpenAutoFocus={(event) => event.preventDefault()}
		onCloseAutoFocus={(event) => event.preventDefault()}
	>
		<div class="flex items-center gap-2 px-2 py-1 {stylex.attrs(styles.noteHead).class}">
			<Info class="size-3.5 shrink-0" aria-hidden="true" />
			<span id="translator-note-label" class="flex-1 {stylex.attrs(styles.noteLabel).class}"
				>{m['article.translator-note']({}, { locale })}</span
			>
			<button
				type="button"
				onclick={() => closeNote(true)}
				class="focus-ring -m-1 p-1 {stylex.attrs(styles.noteClose).class}"
				aria-label={m['article.translator-note.close']({}, { locale })}
			>
				<X class="size-3.5" aria-hidden="true" />
			</button>
		</div>
		<p id="translator-note-description" class="px-3 py-2 {stylex.attrs(styles.noteBody).class}">
			{note}
		</p>
	</PopoverContent>
</Popover.Root>

<style>
	:global(.tn-trigger) {
		margin: 0;
		border: 0;
		background: transparent;
		padding: 0;
		color: inherit;
		font: inherit;
		line-height: var(--focus-link-height);
		text-decoration-line: underline;
		text-decoration-style: dotted;
		text-decoration-color: var(--color-border-strong);
		text-underline-offset: 0.25rem;
		cursor: help;
	}

	:global(.tn-trigger:hover),
	:global(.tn-trigger:focus-visible),
	:global(.tn-trigger[aria-expanded='true']) {
		color: var(--color-text-strong);
		text-decoration-color: currentColor;
	}

	:global(.tn-trigger .tn-icon) {
		display: inline;
		width: 0.78em;
		height: 0.78em;
		margin-inline-start: 0.22em;
		margin-inline-end: 0.12em;
		vertical-align: 0.08em;
		color: var(--color-text-soft);
		text-decoration: none;
	}
</style>

<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { duration } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the language switcher. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css.md.
	 *
	 * The row's highlight and the mark's pair stay in the markup, gated on `data-highlighted`:
	 * StyleX addresses only pseudo-classes and at-rules, and here it would also outrank the
	 * `group-data-` variant left behind. Recorded in spec/todo.md.
	 */
	const styles = stylex.create({
		/** The trigger's caret, which turns to face the panel that is about to open. */
		caret: {
			// Tailwind's `transition-transform` names four properties, and `motion-reduce`
			// suppresses the list rather than the shorthand: the duration and the curve below
			// keep their values there, which is what `transition-none` did and did not do.
			transitionProperty: {
				default: 'transform, translate, scale, rotate',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: duration.base,
			// The curve is Tailwind's `--ease-out`, written out rather than read. Its theme
			// variables are emitted only for the utilities the markup still names, so a variable
			// this file is the last reader of would resolve to nothing once the class is gone.
			transitionTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
		},
		// Turning to face the other way is not a move: the box is where it was, and the glyph is
		// the disclosure's state rather than its position. See spec/architecture/css.md.
		caretClosed: {
			rotate: '180deg',
		},
		/** One row of the menu. */
		option: {
			// Visual under the rule in spec/architecture/css.md: it moves nothing, it says what
			// the element is to a pointer.
			cursor: 'pointer',
			whiteSpace: 'nowrap',
			// No ring on a row: the menu shows where the keyboard is with the highlight fill
			// Bits UI drives through `data-highlighted`, and a second marker would say it twice.
			outlineStyle: 'none',
		},
		/** The two ink tiers a row reads in: the view being read, and every other choice. */
		rowStrong: {
			color: 'var(--color-text-strong)',
		},
		rowSoft: {
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	// Mingcute rather than Lucide for the language marks: it distinguishes machine translation
	// from translation in general, which is the distinction this menu is about. Iconify icons
	// carry their own viewBox, so they are sized by height with an automatic width -- forcing a
	// square scales them inconsistently against each other. See spec/naming.md for the sizes.
	import IconTranslate from '~icons/mingcute/translate-line';
	import IconTranslateAi from '~icons/mingcute/translate-2-ai-line';
	import IconTranslateSimplified from '~icons/mingcute/translate-2-line';
	import IconWorld from '~icons/mingcute/world-2-line';
	import IconUpSmall from '~icons/mingcute/up-small-line';
	import Check from '@lucide/svelte/icons/check';
	import Compass from '@lucide/svelte/icons/compass';
	import { DropdownMenu } from 'bits-ui';
	import MenuContent from '$lib/components/menu-content.svelte';
	import {
		languageChoices,
		MARK_SIZE,
		selectContentLanguage,
		triggerLabel,
		type LanguageChoice,
		type MarkName,
	} from './switcher';
	import { acceptedLocale, contentLanguageCookie, SITE_LANGUAGE, type LocaleCode } from './index';
	import * as m from '$lib/paraglide/messages';

	// The language of the thing being read. An article passes its own; a page passes nothing and
	// takes the site's, which is what its `<html lang>` already declares. See languageChoices.
	//
	// `phoneRegion` is opt-out per caller rather than a measured width: only the article's metadata
	// row has run out of room. `framed` marks a control pushed to the article's right frame rather
	// than sitting in a row's flow, which only that same row does, and only where the rail is absent.
	let {
		code,
		sourceLanguage = SITE_LANGUAGE,
		phoneRegion = true,
		framed = false,
	}: {
		code: LocaleCode;
		sourceLanguage?: string;
		phoneRegion?: boolean;
		framed?: boolean;
	} = $props();
	let open = $state(false);

	/**
	 * Which of the trigger's edges the panel lines up with.
	 *
	 * A control in a row's flow opens from its left edge; one pushed to the article's right frame
	 * opens from its right, so the panel shares an edge with what summoned it.
	 *
	 * Read off whether the rail is rendered, so the breakpoint stays the one number in
	 * `utilities.css`, and read only when the menu opens since there is no server render to survive.
	 */
	let align = $state<'start' | 'end'>('start');

	function alignFor() {
		if (!framed) return 'start' as const;
		const rail = document.querySelector('.article-rail');
		const railShown = Boolean(rail && getComputedStyle(rail).display !== 'none');
		return railShown ? ('start' as const) : ('end' as const);
	}

	/**
	 * The mark a language carries, assigned rather than derived.
	 *
	 * Three marks across eight languages, chosen per language: there is no property of a locale
	 * that produces this grouping, so it is written out instead of computed from one. The
	 * original stands apart with a globe, being the one view nothing was done to.
	 */
	const MARKS = {
		en: 'translate',
		es: 'translate',
		zh: 'translate-simplified',
		tw: 'translate-ai',
		ja: 'translate-ai',
		ko: 'translate-ai',
		de: 'translate-ai',
		fr: 'translate-ai',
		mw: 'world',
	} as const satisfies Record<LocaleCode, MarkName>;

	/**
	 * Named rather than imported straight into the table above, because a mark is now two things:
	 * the glyph, and the height that glyph needs to read the same size as the rest. The name is
	 * what joins them, and it is what `MARK_SIZE` in switcher.ts is keyed by.
	 */
	const MARK_ICON = {
		translate: IconTranslate,
		'translate-simplified': IconTranslateSimplified,
		'translate-ai': IconTranslateAi,
		world: IconWorld,
	} as const satisfies Record<MarkName, unknown>;

	function markFor(choice: LanguageChoice): MarkName {
		return MARKS[choice.code];
	}

	/**
	 * What this browser would have asked for, run through the same parser the worker uses.
	 *
	 * `navigator.languages` is already in descending preference, which is the shape an
	 * Accept-Language header has, so joining it feeds the server's own negotiation rather than a
	 * second reading of the same preferences. Two implementations would eventually disagree, and
	 * the disagreement would show up as a marker pointing at the wrong row.
	 */
	const preferred = $derived(
		acceptedLocale(globalThis.navigator?.languages?.join(',') ?? globalThis.navigator?.language) ??
			'en',
	);

	// Ordered by the reader's own language rather than by the view, so the sequence settles once
	// per reader instead of shifting as they move between translations.
	const choices = $derived(languageChoices(code, sourceLanguage, preferred));
	const current = $derived(choices.find((choice) => choice.current) ?? choices[0]);

	/**
	 * The closed control names the language; the menu names the choices.
	 *
	 * So this is not the current row's label. A row has the whole list beside it for context and
	 * can afford to read `Original`; the trigger stands alone in a metadata row and has to answer
	 * what is being read without one. See switcher.ts.
	 */
	const label = $derived(triggerLabel(code, sourceLanguage));

	/**
	 * The same answer for a row that has no space for the qualifier.
	 *
	 * Both readings render and CSS picks one, rather than a media query read in script: the choice
	 * has to survive the server render, so a correction on the first frame is worse than a few
	 * extra bytes. Equal to `label` unless the caller opted out. See spec/styling/phone.md.
	 */
	const phoneLabel = $derived(
		phoneRegion ? label : triggerLabel(code, sourceLanguage, { region: false }),
	);

	/**
	 * The trigger says where the reader stands; the menu says what each language is.
	 *
	 * So when the view already matches what this browser asked for, the trigger carries the
	 * compass rather than a translation mark -- the one thing worth saying at a glance is that
	 * nothing needs changing. Inside the menu the marks keep naming languages, because there the
	 * compass has the other job: pointing at a row worth moving to.
	 */
	const currentMark = $derived(
		code === preferred || current === undefined ? undefined : markFor(current),
	);
	const CurrentMark = $derived(currentMark ? MARK_ICON[currentMark] : Compass);

	/**
	 * The one slot that holds either icon set, so the one place their difference is spelled out.
	 *
	 * `size-3.75` rather than the row's `size-3.5`: a circle that reaches its box on every side
	 * reads smaller than an angular glyph that only reaches it at the corners. See
	 * spec/styling/focus.md, "An icon set is sized by the ink it carries, not by one class for
	 * all of it".
	 */
	const COMPASS_SIZE = 'size-3.75';

	const markSize = $derived(currentMark ? MARK_SIZE[currentMark] : COMPASS_SIZE);

	function choose(nextCode: string) {
		open = false;
		const choice = choices.find(({ code: choiceCode }) => choiceCode === nextCode);
		if (!choice) return;
		const navigated = selectContentLanguage(code, choice.code, (selectedCode) => {
			document.cookie = contentLanguageCookie(selectedCode, window.location.protocol === 'https:');
			window.location.reload();
		});
		if (!navigated) open = false;
	}
</script>

<DropdownMenu.Root
	{open}
	onOpenChange={(next) => {
		// Settled before the panel exists rather than after it has mounted, or the first frame is
		// positioned against the other edge and corrects itself in view.
		if (next) align = alignFor();
		open = next;
	}}
>
	<DropdownMenu.Trigger
		aria-label={m['language.switcher']({ name: label }, { locale: code })}
		class="-mx-1 inline-flex items-center px-1 py-0.5 {stylex.attrs(surfaces.quietControl).class}"
	>
		<span class="focus-link-inner inline-flex items-center gap-1">
			<CurrentMark class={markSize} aria-hidden="true" />
			<span class={phoneRegion ? undefined : 'max-sm:hidden'}>{label}</span>
			{#if !phoneRegion}
				<span class="sm:hidden">{phoneLabel}</span>
			{/if}
			<!-- Pulled back into the gap: the glyph carries its own padding inside the viewBox, so
			     the 0.25rem gap reads as noticeably more than it does beside the mark on the left. -->
			<IconUpSmall
				class="-ml-0.5 h-4 w-auto {stylex.attrs(styles.caret, !open && styles.caretClosed).class}"
				aria-hidden="true"
			/>
		</span>
	</DropdownMenu.Trigger>

	<MenuContent id="article-language-menu" {align}>
		<DropdownMenu.RadioGroup value={code} onValueChange={choose}>
			{#each choices as choice (choice.code)}
				{@const mark = markFor(choice)}
				{@const Mark = MARK_ICON[mark]}
				<DropdownMenu.RadioItem
					data-language-option
					value={choice.code}
					aria-label={!choice.current && choice.code === preferred
						? `${choice.name}, your browser's preference`
						: undefined}
					class="group flex w-full items-center gap-2 px-2 py-1 text-left data-[highlighted]:bg-paper-hover {stylex.attrs(
						surfaces.uiText,
						styles.option,
					).class}"
				>
					{#snippet children({ checked })}
						<Mark
							class="{MARK_SIZE[
								mark
							]} shrink-0 text-text-soft group-data-[highlighted]:text-text-strong"
							aria-hidden="true"
						/>
						<span class="flex-1 {stylex.attrs(checked ? styles.rowStrong : styles.rowSoft).class}"
							>{choice.name}</span
						>
						<!-- One marker at most: being the current view outranks being the browser's
						     preference, and showing both on one row would say the same thing twice. -->
						{#if checked}
							<Check
								class="size-3.25 shrink-0 {stylex.attrs(styles.rowStrong).class}"
								aria-hidden="true"
							/>
						{:else if choice.code === preferred}
							<Compass
								class="size-3.25 shrink-0 {stylex.attrs(styles.rowSoft).class}"
								aria-hidden="true"
							/>
						{/if}
					{/snippet}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</MenuContent>
</DropdownMenu.Root>

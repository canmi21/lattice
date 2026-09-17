<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, line, radius, text, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the translation strip. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css/authoring.md.
	 *
	 * This file has no scoped block left: its wash and the tint mixed from it were both visual
	 * and reached only this element, and the custom property moved with the colour since it
	 * resolves against the element it lands on. See spec/architecture/css/authoring.md, "A comment in
	 * the module script cannot write a tag in angle brackets", for why this block itself must not.
	 */
	const styles = stylex.create({
		/**
		 * Square on the left so the bar reads as an edge rather than a lozenge, and soft ink
		 * because this belongs to the metadata row above it, not to the article. See
		 * spec/locale/views.md.
		 */
		notice: {
			// The one knob. Flat across the whole strip; past roughly 20% the tint stops reading as
			// tinted paper and becomes a coloured box.
			'--wash': '10%',
			// The shorthand this replaces said a colour and nothing else: every other longhand it
			// reset was already at its initial value, and no rule on this element sets one.
			backgroundColor: 'color-mix(in oklab, var(--color-blue) var(--wash), transparent)',
			// `rounded-r-md` is the two physical corners rather than the logical pair -- that is
			// which pair Tailwind names it as -- and 0.375rem is the `--radius-md` behind it.
			borderTopRightRadius: radius.md,
			borderBottomRightRadius: radius.md,
			// `border-l-2` writes its style through `--tw-border-style`, which is registered with
			// `solid` as its initial value, so the edge computes to two pixels of solid.
			borderLeftWidth: border.doublePx,
			borderLeftStyle: 'solid',
			// All four edges, three of which have no width to draw: `border-blue-ink` is the
			// shorthand, and the computed style carries the colour on every side.
			borderColor: 'var(--color-blue-ink)',
			fontSize: text.px14,
			// The line as `leading-snug` writes it. 1.375 terminates, so it stays a ratio; the rule
			// in spec/architecture/css/authoring.md is about the expansions that do not.
			lineHeight: line.snug,
			color: 'var(--color-text-soft)',
		},
		/** The way back to the original. Its underline and its ring are the vocabulary's. */
		original: {
			fontWeight: weight.medium,
		},
	});
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { ParaglideMessage } from '@inlang/paraglide-js-svelte';
	import type { LocaleCode } from '$lib/locale';
	import { chooseLocale } from '$lib/locale/current.svelte';
	import {
		contentLanguageHref,
		languageName,
		publishedLabel,
		sourceCode,
		sourceLanguageName,
	} from '$lib/locale/switcher';
	import { fillSlot } from '$lib/locale/spacing';
	import * as m from '$lib/paraglide/messages';

	type TranslationCode = Exclude<LocaleCode, 'mw'>;

	let {
		code,
		sourceLanguage,
		available,
		prefetch,
	}: {
		code: TranslationCode;
		sourceLanguage: string;
		available: boolean;
		/** Fetches a view so the swap has something to swap to. See the switcher beside this. */
		prefetch?: (next: LocaleCode) => Promise<unknown>;
	} = $props();

	let pending = $state(false);

	// The pointer says the click was taken while the article is on its way, the same signal the
	// switcher gives. There is nothing else to move: the sentence is about to stop existing.
	$effect(() => {
		if (!pending) return;
		document.documentElement.style.cursor = 'progress';
		return () => {
			document.documentElement.style.cursor = '';
		};
	});

	const language = $derived(sourceLanguageName(sourceLanguage, code));
	const originalHref = $derived(contentLanguageHref('mw', page.url));
	const source = $derived(sourceCode(sourceLanguage));
	// The folded name, not the endonym: this sits inside a sentence, and `中文 (简体)版本` puts a
	// bracket between the language and the noun it qualifies. See spec/locale/interface.md.
	const requestedLanguage = $derived(languageName(code));

	/**
	 * The language the reader is being shown, named the way the closed switcher names it.
	 *
	 * An article written in a language this site publishes no view of has no such label, so it
	 * falls back to the language spelled out in the reading view -- the same thing the notice
	 * said before, rather than a bracket with nothing to put in it.
	 */
	const shown = $derived(
		source ? publishedLabel(source) : sourceLanguageName(sourceLanguage, code),
	);

	/** Stands in for the language name while the sentence around it is measured. See fillSlot. */
	const SLOT = '\u0000';

	const unavailable = $derived(
		fillSlot(
			m['notice.unavailable']({ language: requestedLanguage, source: SLOT }, { locale: code }),
			SLOT,
			shown,
		),
	);

	const unavailableShort = $derived(
		fillSlot(
			m['notice.unavailable.short'](
				{ language: requestedLanguage, source: SLOT },
				{ locale: code },
			),
			SLOT,
			shown,
		),
	);

	/**
	 * Take the source view without leaving the page.
	 *
	 * The same swap the language menu makes; it used to be a cookie write and a reload. The
	 * article is fetched first, so the notice does not vanish before what it announced has. The
	 * `?lang=mw` href stays as the fallback it always was -- a modified click, or no JavaScript.
	 * See spec/locale/views.md.
	 */
	async function showOriginal(event: MouseEvent) {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}
		event.preventDefault();
		pending = true;
		// A failed fetch is not a reason to stay: the load this invalidates will ask again, and
		// reaching the source view is what the reader asked for.
		await prefetch?.('mw').catch(() => undefined);
		await chooseLocale('mw');
		pending = false;
	}

	/**
	 * Which of the three things this view is, to the article.
	 *
	 * Script sibling is tested first: a Simplified article read at `tw` is also not the same
	 * code, and would otherwise be announced as a translation. See spec/locale/views.md.
	 */
	const kind = $derived(
		(code === 'zh' && source === 'tw') || (code === 'tw' && source === 'zh')
			? 'script'
			: source === code
				? 'polished'
				: 'translated',
	);

	const message = $derived(
		kind === 'script'
			? m['notice.script']
			: kind === 'polished'
				? m['notice.polished']
				: m['notice.translated'],
	);

	/**
	 * The same sentence written for a phone's column.
	 *
	 * Both readings are rendered and CSS picks one, the shape the newsletter pitch uses and for
	 * the same reason: the choice has to survive the server render, and a media query is not
	 * something the server can see. See spec/styling/phone.md.
	 */
	const messageShort = $derived(
		kind === 'script'
			? m['notice.script.short']
			: kind === 'polished'
				? m['notice.polished.short']
				: m['notice.translated.short'],
	);
</script>

<div role="note" class="notice mt-4 py-1.5 pr-3 pl-3 {stylex.attrs(styles.notice).class}">
	{#if available}
		<p class="hidden sm:block">
			<ParaglideMessage {message} inputs={{ language }} options={{ locale: code }}>
				{#snippet link({ children })}
					<a
						href={originalHref}
						data-sveltekit-reload
						onclick={showOriginal}
						class="focus-link spring-underline {stylex.attrs(styles.original).class}"
						>{@render children?.()}</a
					>
				{/snippet}
			</ParaglideMessage>
		</p>
		<p class="sm:hidden">
			<ParaglideMessage message={messageShort} inputs={{ language }} options={{ locale: code }}>
				{#snippet link({ children })}
					<a
						href={originalHref}
						data-sveltekit-reload
						onclick={showOriginal}
						class="focus-link spring-underline {stylex.attrs(styles.original).class}"
						>{@render children?.()}</a
					>
				{/snippet}
			</ParaglideMessage>
		</p>
	{:else}
		<p class="hidden sm:block">{unavailable}</p>
		<p class="sm:hidden">{unavailableShort}</p>
	{/if}
</div>

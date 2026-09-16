<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import {
		border,
		duration,
		easing,
		family,
		line,
		radius,
		text,
		transition,
	} from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the registry directory. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css/authoring.md.
	 *
	 * The page writes the same trail, the same heading and the same directory row as the licence
	 * directory one level up, and those styles say what its styles say, name for name. They are
	 * written out rather than shared: a visual constant with two consumers wants a module of its
	 * own, and where that module should live is the question spec/todo.md is already holding.
	 */
	const styles = stylex.create({
		backLink: {
			fontSize: text.px15,
			color: {
				default: 'var(--color-text-soft)',
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the colour from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
			// The whole of `transition-colors`, the three `--tw-gradient-*` variables included.
			// Nothing here sets a gradient and they animate nothing, but the measure of sameness
			// is the computed value and dropping them changes it. Whether the visual layer should
			// be naming another framework's private variables is in spec/todo.md.
			transitionProperty: transition.colors,
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
		title: {
			color: 'var(--color-text-strong)',
		},
		/** The one opening paragraph, which counts the packages behind the directory below. */
		summary: {
			// `leading-relaxed` is Tailwind's `--leading-relaxed`, and its value is written out
			// rather than read: that variable is emitted only for the utilities that name it, so
			// reading it here would leave this line depending on a class somewhere else in the
			// markup. The value terminates, so there is no arithmetic to round.
			lineHeight: line.relaxed,
			textWrap: 'pretty',
			color: 'var(--color-text-soft)',
		},
		/** The line holding the language switcher. Both declarations inherit into it. */
		switcherRow: {
			fontSize: text.px15,
			color: 'var(--color-text-soft)',
		},
		/** One row of the directory: a registry name, a leader, and its count. */
		entry: {
			borderRadius: radius.lg,
			backgroundColor: {
				default: null,
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-paper-hover)' },
			},
			// The ring belongs to the name inside, which `focus-link-inner` draws around the text
			// rather than around the full width of the row.
			outlineStyle: { default: null, ':focus-visible': 'none' },
		},
		/** The dashed rule running from the name to the count. */
		leader: {
			borderTopWidth: border.hairlinePx,
			borderStyle: 'dashed',
			borderColor: 'var(--color-border-strong)',
		},
		count: {
			fontFamily: family.monoTheme,
			fontSize: text.px15,
			fontVariantNumeric: 'tabular-nums',
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import { dev } from '$app/environment';
	import { pageUrls, URLS } from '@canmi/urls';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { localeUrl } from '$lib/locale';
	import LanguageSwitcher from '$lib/locale/switcher.svelte';
	import { CARD_HEIGHT, CARD_WIDTH, cardUrl } from '$lib/opengraph';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';
	import { compactCount, intlLocale } from '$lib/format';

	let { data }: { data: PageData } = $props();
	const locale = $derived(data.locale.code);
	const numberLocale = $derived(intlLocale(locale));
	const count = $derived(new Intl.NumberFormat(numberLocale).format(data.total));
	const title = $derived(m['licenses.packages']({}, { locale }));
	const description = $derived(m['licenses.packages_description']({ count }, { locale }));
	const slug = 'licenses/pkgs';
	const cdn = pageUrls(dev).cdn;
	const canonical = $derived(localeUrl(`${URLS.apps.production.site}/${slug}`, locale));
	const card = $derived(cardUrl(cdn, slug, locale));
</script>

<svelte:head>
	<title>{title} · {m['licenses.title']({}, { locale })}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={card} />
	<meta property="og:image:width" content={CARD_WIDTH} />
	<meta property="og:image:height" content={CARD_HEIGHT} />
	<meta property="og:image:alt" content={title} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main class="min-h-screen {stylex.attrs(surfaces.page).class}">
	<article class="mx-auto max-w-180 px-6 py-24">
		<nav aria-label={m['licenses.breadcrumb']({}, { locale })}>
			<a
				href="/licenses"
				class="focus-link inline-flex items-center gap-1.5 {stylex.attrs(styles.backLink).class}"
			>
				<ArrowLeft class="size-4" aria-hidden="true" />
				<span>{m['licenses.all_licenses']({}, { locale })}</span>
			</a>
		</nav>

		<header class="mt-8">
			<h1 class={stylex.attrs(styles.title).class}>{m['licenses.packages']({}, { locale })}</h1>
			<p class="mt-4 {stylex.attrs(styles.summary).class}">
				{m['licenses.packages_summary']({ count }, { locale })}
			</p>
			<div class="mt-4 {stylex.attrs(styles.switcherRow).class}">
				<LanguageSwitcher code={locale} />
			</div>
		</header>

		<section aria-labelledby="registry-directory" class="mt-16">
			<h2 id="registry-directory" class="mb-3 {stylex.attrs(surfaces.heading).class}">
				{m['licenses.registries']({}, { locale })}
			</h2>
			{#each data.registries as registry (registry.id)}
				<a
					href={registry.href}
					class="focus-ring-within -mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-1 {stylex.attrs(
						styles.entry,
					).class}"
				>
					<span class="flex min-w-0 items-center gap-3">
						<span class="focus-link-inner min-w-0 truncate">{registry.name}</span>
						<span class="h-0 min-w-6 flex-1 {stylex.attrs(styles.leader).class}"></span>
					</span>
					<span class={stylex.attrs(styles.count).class}>{compactCount(registry.count)}</span>
				</a>
			{/each}
		</section>
	</article>
</main>

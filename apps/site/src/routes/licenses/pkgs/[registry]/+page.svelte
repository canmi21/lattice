<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { duration, easing, family, line, text, transition, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of one registry's page. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css.md.
	 *
	 * The page is a sibling of the two directories above it and writes the same trail, the same
	 * header and the same quiet control, so several of these say what a style there says, name
	 * for name. They are written out rather than shared: a visual constant with two consumers
	 * wants a module of its own, and where that module should live is the question
	 * spec/todo.md is already holding.
	 */
	const styles = stylex.create({
		page: {
			backgroundColor: 'var(--color-page)',
			color: 'var(--color-text)',
		},
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
		/** The one opening paragraph, which counts the packages this registry supplies. */
		summary: {
			// `leading-relaxed` is Tailwind's `--leading-relaxed`, and its value is written out
			// rather than read: that variable is emitted only for the utilities that name it, so
			// reading it here would leave this line depending on a class somewhere else in the
			// markup. The value terminates, so there is no arithmetic to round.
			lineHeight: line.relaxed,
			textWrap: 'pretty',
			color: 'var(--color-text-soft)',
		},
		/** The link out to the registry itself. `quiet-control` draws the rest of it. */
		actionLink: {
			fontSize: text.px15,
		},
		sectionHeading: {
			fontWeight: weight.medium,
			color: 'var(--color-text-strong)',
		},
		/** The count beside the section heading, a step smaller than a directory row's. */
		count: {
			fontFamily: family.monoTheme,
			fontSize: text.px13,
			fontVariantNumeric: 'tabular-nums',
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import { dev } from '$app/environment';
	import { pageUrls, URLS } from '@canmi/urls';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { localeUrl } from '$lib/locale';
	import LanguageSwitcher from '$lib/locale/switcher.svelte';
	import PackageList from '$lib/licenses/package-list.svelte';
	import { CARD_HEIGHT, CARD_WIDTH, cardUrl } from '$lib/opengraph';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';
	import { compactCount, intlLocale } from '$lib/format';

	let { data }: { data: PageData } = $props();
	const locale = $derived(data.locale.code);
	const numberLocale = $derived(intlLocale(locale));
	const count = $derived(new Intl.NumberFormat(numberLocale).format(data.rows.length));
	const title = $derived(data.registry.name);
	const description = $derived(
		m['licenses.registry_description']({ registry: data.registry.name, count }, { locale }),
	);
	const slug = $derived(`licenses/pkgs/${data.registry.id}`);
	const cdn = pageUrls(dev).cdn;
	const canonical = $derived(localeUrl(`${URLS.apps.production.site}/${slug}`, locale));
	const card = $derived(cardUrl(cdn, slug, locale));
</script>

<svelte:head>
	<title>{title} · {m['licenses.packages']({}, { locale })}</title>
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

<main class="min-h-screen {stylex.attrs(styles.page).class}">
	<article class="mx-auto max-w-180 px-6 py-24">
		<nav aria-label={m['licenses.breadcrumb']({}, { locale })}>
			<a
				href="/licenses/pkgs"
				class="focus-link inline-flex items-center gap-1.5 {stylex.attrs(styles.backLink).class}"
			>
				<ArrowLeft class="size-4" aria-hidden="true" />
				<span>{m['licenses.packages']({}, { locale })}</span>
			</a>
		</nav>

		<header class="mt-8">
			<h1 class={stylex.attrs(styles.title).class}>{data.registry.name}</h1>
			<p class="mt-4 {stylex.attrs(styles.summary).class}">
				{m['licenses.registry_summary']({ count }, { locale })}
			</p>
			<nav aria-label={m['licenses.actions']({}, { locale })} class="mt-4 flex flex-wrap gap-4">
				<a
					href={data.registry.href}
					target="_blank"
					rel="noopener"
					class="quiet-control {stylex.attrs(styles.actionLink).class}"
				>
					<span class="focus-link-inner inline-flex items-center gap-1.5">
						<ExternalLink class="size-3.5" aria-hidden="true" />
						<span>{m['licenses.registry']({}, { locale })}</span>
					</span>
				</a>
				<LanguageSwitcher code={locale} />
			</nav>
		</header>

		<section aria-labelledby="package-list" class="mt-16">
			<div class="mb-3 flex items-baseline justify-between gap-4">
				<h2 id="package-list" class={stylex.attrs(styles.sectionHeading).class}>
					{m['licenses.packages']({}, { locale })}
				</h2>
				<span class={stylex.attrs(styles.count).class}>{compactCount(data.rows.length)}</span>
			</div>
			<PackageList rows={data.rows} {locale} />
		</section>
	</article>
</main>

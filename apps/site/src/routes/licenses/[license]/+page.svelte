<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { family, line, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of one licence's page. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css/authoring.md.
	 *
	 * Third of the licence surface's directory pages, writing the same trail, heading and tabular
	 * count as the two above it, name for name. Written out rather than shared -- where a module
	 * for this should live is the question spec/todo.md is already holding.
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
		},
		/**
		 * The licence identifier as a heading. It carries a break the two directory titles do
		 * not, because this one is an SPDX expression rather than a word: an overflow wrap is how
		 * the package page's `name` and `spdx` already write the same need.
		 */
		title: {
			overflowWrap: 'break-word',
			color: 'var(--color-text-strong)',
		},
		/** The one opening paragraph, which counts the packages behind the sections below. */
		summary: {
			// The line is Tailwind's `--leading-relaxed`, and its value is written out rather
			// than read: that variable is emitted only for the utilities that name it, so reading
			// it here would leave this line depending on a class somewhere else in the markup.
			// The value terminates, so there is no arithmetic to round.
			lineHeight: line.relaxed,
			textWrap: 'pretty',
			color: 'var(--color-text-soft)',
		},
		actionLink: {
			fontSize: text.px15,
		},
		/**
		 * The package count beside a registry's name. A step smaller than the same count on the
		 * two directory pages, which is what the markup said before this moved.
		 */
		count: {
			fontFamily: family.monoTheme,
			fontSize: text.px13,
			fontVariantNumeric: 'tabular-nums',
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import { URLS } from '@canmi/urls';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { localeUrl } from '$lib/locale';
	import LanguageSwitcher from '$lib/locale/switcher.svelte';
	import PackageList from '$lib/licenses/package-list.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';
	import { compactCount, intlLocale } from '$lib/format';

	let { data }: { data: PageData } = $props();
	const locale = $derived(data.locale.code);
	const numberLocale = $derived(intlLocale(locale));
	const count = $derived(new Intl.NumberFormat(numberLocale).format(data.license.count));
	const title = $derived(data.license.license);
	const description = $derived(
		m['licenses.license_description']({ license: data.license.license, count }, { locale }),
	);
	const slug = $derived(`licenses/${data.license.slug}`);
	const canonical = $derived(localeUrl(`${URLS.apps.production.site}/${slug}`, locale));
</script>

<svelte:head>
	<title>{title} · {m['licenses.title']({}, { locale })}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
</svelte:head>

<main class="min-h-screen {stylex.attrs(surfaces.page).class}">
	<article class="mx-auto max-w-180 px-6 py-24">
		<nav aria-label={m['licenses.breadcrumb']({}, { locale })}>
			<a
				href="/licenses"
				class="focus-link inline-flex items-center gap-1.5 {stylex.attrs(
					surfaces.colorShift,
					styles.backLink,
				).class}"
			>
				<ArrowLeft class="size-4" aria-hidden="true" />
				<span>{m['licenses.all_licenses']({}, { locale })}</span>
			</a>
		</nav>

		<header class="mt-8">
			<h1 class={stylex.attrs(styles.title).class}>{data.license.license}</h1>
			<p class="mt-4 {stylex.attrs(styles.summary).class}">
				{m['licenses.license_summary']({ count }, { locale })}
			</p>
			<nav aria-label={m['licenses.actions']({}, { locale })} class="mt-4 flex flex-wrap gap-4">
				<a
					href={data.spdxHref}
					target="_blank"
					rel="noopener"
					class="-mx-1 inline-flex items-center px-1 py-0.5 {stylex.attrs(
						surfaces.quietControl,
						surfaces.focusRingHost,
						styles.actionLink,
					).class}"
				>
					<span
						class="focus-link-inner inline-flex items-center gap-1.5 {stylex.attrs(
							surfaces.focusLinkInner,
						).class}"
					>
						<ExternalLink class="size-3.5" aria-hidden="true" />
						<span>{m['licenses.spdx']({}, { locale })}</span>
					</span>
				</a>
				<LanguageSwitcher code={locale} />
			</nav>
		</header>

		{#each data.groups as group (group.registry)}
			<section aria-labelledby="registry-{group.registry}" class="mt-16">
				<div class="mb-3 flex items-baseline justify-between gap-4">
					<h2 id="registry-{group.registry}" class={stylex.attrs(surfaces.heading).class}>
						{group.name}
					</h2>
					<span class={stylex.attrs(styles.count).class}>{compactCount(group.rows.length)}</span>
				</div>
				<PackageList rows={group.rows} {locale} license={data.license.license} />
			</section>
		{/each}
	</article>
</main>

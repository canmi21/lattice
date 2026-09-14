<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, duration, easing, family, line, radius, text, transition } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the licence directory. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css.md.
	 *
	 * The page is the package page's sibling -- a trail, a header, a row of quiet controls and a
	 * list -- and several of these say what a style there says. They are written out rather than
	 * shared: a visual constant with two consumers wants a module of its own, and where that
	 * module should live is the question spec/todo.md is already holding.
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
		/** The opening paragraphs. Both declarations inherit down to the paragraphs inside. */
		intro: {
			// `leading-relaxed` is Tailwind's `--leading-relaxed`, and its value is written out
			// rather than read: that variable is emitted only for the utilities that name it, so
			// reading it here would leave this line depending on a class somewhere else in the
			// markup. The value terminates, so there is no arithmetic to round.
			lineHeight: line.relaxed,
			textWrap: 'pretty',
		},
		/** The last of the three, quieter than the two above it. */
		introNote: {
			color: 'var(--color-text-soft)',
		},
		/** A link inside prose. The named classes draw the underline; this is only its colour. */
		proseLink: {
			color: 'var(--color-text)',
		},
		census: {
			textWrap: 'pretty',
			color: 'var(--color-text-soft)',
		},
		actionLink: {
			fontSize: text.px15,
		},
		/** One row of the directory: a licence name, a leader, and its count. */
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
		footnote: {
			fontSize: text.px13,
			textWrap: 'pretty',
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import { dev } from '$app/environment';
	import { pageUrls, URLS } from '@canmi/urls';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import FileText from '@lucide/svelte/icons/file-text';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import Scale from '@lucide/svelte/icons/scale';
	import { ParaglideMessage } from '@inlang/paraglide-js-svelte';
	import { localeUrl } from '$lib/locale';
	import { spaceScriptBoundaries } from '$lib/locale/spacing';
	import LanguageSwitcher from '$lib/locale/switcher.svelte';
	import { CARD_HEIGHT, CARD_WIDTH, cardUrl } from '$lib/opengraph';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';
	import { compactCount, intlLocale } from '$lib/format';

	let { data }: { data: PageData } = $props();
	const locale = $derived(data.locale.code);
	const title = $derived(m['licenses.title']({}, { locale }));
	const description = $derived(m['licenses.description']({}, { locale }));
	const slug = 'licenses';
	const cdn = pageUrls(dev).cdn;
	const canonical = $derived(localeUrl(`${URLS.apps.production.site}/${slug}`, locale));
	const card = $derived(cardUrl(cdn, slug, locale));
	const numberLocale = $derived(intlLocale(locale));
	const count = $derived(new Intl.NumberFormat(numberLocale).format(data.total));
	const registryParts = $derived.by(() => {
		const parts = new Intl.ListFormat(numberLocale, {
			style: 'long',
			type: 'conjunction',
		}).formatToParts(data.registries.map(({ name }) => name));
		const spaced = spaceScriptBoundaries(parts.map(({ value }) => value));
		return parts.map((part, index) => ({
			type: part.type,
			value: part.value,
			gapBefore: (spaced[index] ?? '').length > part.value.length,
			registry:
				part.type === 'element'
					? data.registries.find(({ name }) => name === part.value)
					: undefined,
		}));
	});
</script>

<svelte:head>
	<title>{title}</title>
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
	<!--
		No robots meta: the directory pages of the licence surface are indexable, which is what
		app.html already says by default. Only one page here departs from it, and that is the
		individual package page, which sets `noindex, follow` itself. See the sitemap route.
	-->
</svelte:head>

<main class="min-h-screen {stylex.attrs(surfaces.page).class}">
	<article class="mx-auto max-w-180 px-6 py-24">
		<nav aria-label={m['licenses.breadcrumb']({}, { locale })}>
			<a
				href="/"
				class="focus-link inline-flex items-center gap-1.5 {stylex.attrs(styles.backLink).class}"
			>
				<ArrowLeft class="size-4" aria-hidden="true" />
				<span>{m['nav.home']({}, { locale })}</span>
			</a>
		</nav>

		<header class="mt-8">
			<h1 class={stylex.attrs(styles.title).class}>{m['licenses.title']({}, { locale })}</h1>
			<div class="mt-4 space-y-4 {stylex.attrs(styles.intro).class}">
				<p>{m['licenses.built']({}, { locale })}</p>
				<p>{m['licenses.thanks']({}, { locale })}</p>
				<p class={stylex.attrs(styles.introNote).class}>
					<ParaglideMessage message={m['licenses.below']} inputs={{}} options={{ locale }}>
						{#snippet license()}<a
								href="{URLS.external.spdx}/MIT.html"
								target="_blank"
								rel="noopener"
								class="focus-link spring-underline article-link {stylex.attrs(styles.proseLink)
									.class}">{m['licenses.mit']({}, { locale })}</a
							>{/snippet}
						{#snippet link()}<a
								href={URLS.source}
								target="_blank"
								rel="noopener"
								class="focus-link spring-underline article-link {stylex.attrs(styles.proseLink)
									.class}">{m['licenses.repository']({}, { locale })}</a
							>{/snippet}
					</ParaglideMessage>
				</p>
			</div>
		</header>

		<p class="mt-8 {stylex.attrs(styles.census).class}">
			<ParaglideMessage
				message={m['licenses.census']}
				inputs={{ count, licenses: data.licenses.length }}
				options={{ locale }}
			>
				{#snippet registries()}{#each registryParts as part, index (index)}{#if part.gapBefore}{' '}{/if}{#if part.registry}<a
								href={part.registry.href}
								target="_blank"
								rel="noopener"
								class="focus-link spring-underline article-link {stylex.attrs(styles.proseLink)
									.class}">{part.value}</a
							>{:else}{part.value}{/if}{/each}{/snippet}
			</ParaglideMessage>
		</p>

		<nav aria-label={m['licenses.actions']({}, { locale })} class="mt-4 flex flex-wrap gap-4">
			<a href="/licenses/pkgs" class="quiet-control {stylex.attrs(styles.actionLink).class}">
				<span class="focus-link-inner inline-flex items-center gap-1.5">
					<FolderOpen class="size-3.5" aria-hidden="true" />
					<span>{m['licenses.packages']({}, { locale })}</span>
				</span>
			</a>
			<a
				href="/licenses.txt"
				data-sveltekit-reload
				class="quiet-control {stylex.attrs(styles.actionLink).class}"
			>
				<span class="focus-link-inner inline-flex items-center gap-1.5">
					<FileText class="size-3.5" aria-hidden="true" />
					<span>{m['licenses.index']({}, { locale })}</span>
				</span>
			</a>
			<a
				href="/licenses/full.txt"
				data-sveltekit-reload
				class="quiet-control {stylex.attrs(styles.actionLink).class}"
			>
				<span class="focus-link-inner inline-flex items-center gap-1.5">
					<Scale class="size-3.5" aria-hidden="true" />
					<span>{m['licenses.full']({}, { locale })}</span>
				</span>
			</a>
			<LanguageSwitcher code={locale} />
		</nav>

		<section aria-labelledby="license-directory" class="mt-16">
			<h2 id="license-directory" class="mb-3 {stylex.attrs(surfaces.heading).class}">
				{m['licenses.directory']({}, { locale })}
			</h2>
			{#each data.licenses as entry (entry.slug)}
				<a
					href="/licenses/{entry.slug}"
					class="focus-ring-within -mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-1 {stylex.attrs(
						styles.entry,
					).class}"
				>
					<span class="flex min-w-0 items-center gap-3">
						<span class="focus-link-inner min-w-0 truncate">{entry.license}</span>
						<span class="h-0 min-w-6 flex-1 {stylex.attrs(styles.leader).class}"></span>
					</span>
					<span class={stylex.attrs(styles.count).class}>{compactCount(entry.count)}</span>
				</a>
			{/each}
			<p class="mt-3 {stylex.attrs(styles.footnote).class}">
				<span aria-hidden="true">*&nbsp;</span>{m['licenses.multiple']({}, { locale })}
			</p>
		</section>
	</article>
</main>

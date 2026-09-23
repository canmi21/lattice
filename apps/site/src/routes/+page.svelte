<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, line, radius, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the home page. Every colour is the token variable `libs/tokens` already
	 * declares, so nothing here can change one. See spec/architecture/css/authoring.md.
	 *
	 * The two link styles below say the same thing twice at two sizes. They are written out
	 * rather than shared: a visual constant with two consumers wants a module of its own, and
	 * where that module should live is the question spec/todo/todo.md is already holding.
	 */
	const styles = stylex.create({
		avatar: {
			// The pill corner is `calc(infinity * 1px)` rather than a large length, and the
			// arithmetic is carried across unread: Chrome clamps it to a value a literal would
			// have to guess at, and the measure of sameness is the computed one.
			borderRadius: radius.full,
			borderWidth: border.doublePx,
			borderStyle: 'solid',
			borderColor: 'var(--color-border)',
		},
		name: {
			color: 'var(--color-text-strong)',
		},
		role: {
			color: 'var(--color-text-soft)',
		},
		/** The bio, which is the one block of prose on the page. */
		bio: {
			// The line is Tailwind's `--leading-relaxed`, and its value is written out rather
			// than read: that variable is emitted only for the utilities that name it, so reading
			// it here would leave this line depending on a class somewhere else in the markup.
			// The value terminates, so there is no arithmetic to round.
			lineHeight: line.relaxed,
		},
		/** The line holding the language switcher. Both declarations inherit into it. */
		switcherRow: {
			fontSize: text.px15,
			color: 'var(--color-text-soft)',
		},
		/** One of the glyphs in the row of elsewheres. */
		socialLink: {
			borderRadius: '0.3125rem',
			color: {
				default: 'var(--color-text-soft)',
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the colour from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
		},
		/** The registration badge sharing the row with them. */
		icpLink: {
			fontSize: text.px15,
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
		},
	});
</script>

<script lang="ts">
	import { dev } from '$app/environment';
	import { imgsrc } from '@canmi/imgsrc';
	import { pageUrls, URLS } from '@canmi/urls';
	import Coffee from '@lucide/svelte/icons/coffee';
	import Lollipop from '@lucide/svelte/icons/lollipop';
	import ArticleList from '$lib/article/list.svelte';
	import Modal from '$lib/components/modal.svelte';
	import PageBody from '$lib/home/body.svelte';
	import Icon from '$lib/home/icons.svelte';
	import LanguageSwitcher from '$lib/locale/switcher.svelte';
	import { localeUrl } from '$lib/locale';
	import { warmListed } from '$lib/client/warm.svelte';
	import { publishedHome } from '$lib/published';
	import Newsletter from '$lib/newsletter/newsletter.svelte';
	import { CARD_HEIGHT, CARD_WIDTH, cardUrl } from '$lib/opengraph';
	import * as m from '@canmi/messages';
	import { site } from '$lib/site';
	import Support from '$lib/support/support.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let sponsorOpen = $state(false);

	const cdnUrl = pageUrls(dev).cdn;
	const avatarSrc = imgsrc(`github:avatar:${site.author.githubId}@192`, { cdnUrl });
	const card = $derived(cardUrl(cdnUrl, data.card));

	/**
	 * A device with no pointer never says which article interests it, so the list it is shown
	 * is warmed whole. `warmListed` decides that; a pointer device leaves here having done nothing.
	 *
	 * TODO: this list shows every article there is and wants folding. It warms what is on screen,
	 * so it follows that change rather than needing to be found again. See spec/todo/todo.md.
	 */
	$effect(() => {
		warmListed(
			data.articles.map(({ slug }) => slug),
			data.locale.code,
		);
	});
	const githubProfileUrl = `${URLS.external.github.web}/${site.author.github}`;
	const googleSourceUrl = new URL(URLS.external.google.sourcePreferences);
	googleSourceUrl.searchParams.set('q', URLS.apps.production.site);
	// Icons are center-anchored, so each is size-compensated independently. Base
	// matches the inline text icons (h-4); wide/flat glyphs (Telegram) get a larger
	// box to read optically equal.
	const base = 'h-4 w-4';
	// `document` keeps server-only resources out of the client page router.
	// See spec/locale/addressing.md#server-only-documents-leave-the-page-router.
	//
	// Derived, not built once: the feed is the one entry here that names a language, and taking
	// one no longer reloads the page.
	const links = $derived([
		{ name: 'github', label: 'GitHub', href: githubProfileUrl, size: base },
		...(site.author.twitter
			? ([
					{
						name: 'twitter',
						label: 'Twitter',
						href: `${URLS.external.social.twitterIntent}?screen_name=${site.author.twitter}`,
						size: base,
					},
				] as const)
			: []),
		{
			name: 'nyaone',
			label: 'Nya.one',
			href: `${URLS.external.social.fediverse}/@${site.author.fediverse}`,
			size: base,
		},
		{
			name: 'bluesky',
			label: 'Bluesky',
			href: `${URLS.external.social.bluesky}/${site.author.bluesky}`,
			size: base,
		},
		{
			name: 'telegram',
			label: 'Telegram',
			href: `${URLS.external.social.telegram}/${site.author.telegram}`,
			size: 'h-5 w-5',
		},
		{ name: 'sitemap', label: 'Sitemap', href: '/sitemap.xml', size: base, document: true },
		{
			name: 'travellings',
			label: 'Travellings',
			href: URLS.external.webring.travellings,
			size: base,
		},
		{ name: 'moe', label: 'Travellings Moe', href: URLS.external.webring.moe, size: base },
		// The feed a reader subscribes to is the one they are reading, so it carries the view they
		// are in. The source view keeps the bare address, which is what `localeUrl` is for.
		{
			name: 'rss',
			label: 'RSS feed',
			href: localeUrl('/atom.xml', data.locale.code),
			size: base,
			document: true,
		},
	] as const);
</script>

<svelte:head>
	<title>{data.title}</title>
	<meta name="description" content={data.description} />
	<!--
		The home page had no card at all, while `local og` had been rendering one for it since the
		beginning. A page that advertises nothing is shared as a bare link, which is the one
		place a card is most worth having.
	-->
	<meta property="og:type" content="website" />
	<meta property="og:title" content={data.title} />
	<meta property="og:description" content={data.description} />
	<meta property="og:url" content={URLS.apps.production.site} />
	{#if card}
		<meta property="og:image" content={card} />
		<meta property="og:image:width" content={CARD_WIDTH} />
		<meta property="og:image:height" content={CARD_HEIGHT} />
		<meta property="og:image:alt" content={data.title} />
	{/if}
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<!-- Selection off by default, since the page is mostly controls and a drag on a card or button
     should not sweep up a date or label with it; every sentence below, and every one inside the
     components this page holds, turns it back on with `select-text`. Both utilities carry the
     `-webkit-` prefix Safari 16 still needs, which is the floor in spec/compat.md. -->
<main class="min-h-screen select-none {stylex.attrs(surfaces.page).class}">
	<!-- Less air on a phone at both ends, where 6rem is most of what the reader can see before
	     scrolling. The foot takes two thirds of what the head does: the space above opens the page
	     and the space below only ends it. -->
	<article class="mx-auto max-w-180 px-6 pt-12 pb-8 sm:py-24">
		<header class="flex items-center gap-3">
			<img
				src={avatarSrc}
				alt={`${site.author.name}'s avatar`}
				width="52"
				height="52"
				fetchpriority="high"
				class="h-13 w-13 {stylex.attrs(styles.avatar).class}"
			/>
			<div>
				<h1 class="select-text {stylex.attrs(styles.name).class}">{site.author.fullName}</h1>
				<p class="select-text {stylex.attrs(styles.role).class}">{site.author.role}</p>
			</div>
		</header>

		<!-- Bio prose is compiled from contents/index.md (DLC directives), single-sourced
		with /llms.txt. PageBody keeps styled text as dead HTML and renders each social
		link live so its icon reuses the shared <Icon> component. -->
		<div class="select-text mt-8 space-y-4 {stylex.attrs(styles.bio).class}">
			<PageBody blocks={data.bio} locale={data.locale.code} />
		</div>

		<!-- Below the bio, not beside the name: the bio is identity copy that never changes with the
		     switcher, so a control sitting above text it does not move would read as broken. No
		     heading and no rule -- this is page furniture, not a section, and the preference it
		     writes is the site's, not this page's. -->
		<div class="mt-8 flex flex-wrap items-center gap-4 {stylex.attrs(styles.switcherRow).class}">
			<LanguageSwitcher code={data.locale.code} prefetch={(next) => publishedHome(fetch, next)} />
		</div>

		<ArticleList articles={data.articles} heading={data.writing} shapes={data.shapes} />

		<Newsletter locale={data.locale.code} class="mt-16" />

		<Support
			locale={data.locale.code}
			sourcePreferenceHref={googleSourceUrl.href}
			repositoryHref={URLS.source}
			onsponsor={() => (sponsorOpen = true)}
		/>

		<!-- Left-aligned like everything above it: the page is one text column all the way down,
		and a centred footer was the only thing arguing otherwise. The ICP badge shares the row
		rather than taking one of its own. -->
		<div
			class="mt-12 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 max-sm:justify-center"
		>
			<nav aria-label="Find me elsewhere" class="flex flex-wrap items-center gap-3">
				{#each links as link (link.label)}
					<a
						href={link.href}
						aria-label={link.href.startsWith('/')
							? link.label
							: `${link.label} (${m['support.new-tab']({}, { locale: data.locale.code })})`}
						title={link.label}
						data-sveltekit-reload={'document' in link ? true : undefined}
						class="focus-ring inline-flex size-5 items-center justify-center {stylex.attrs(
							surfaces.colorShift,
							styles.socialLink,
						).class}"
						{...link.href.startsWith('/') ? {} : { target: '_blank', rel: 'noopener' }}
					>
						<Icon name={link.name} class={link.size} />
					</a>
				{/each}
			</nav>

			<a
				href="{URLS.external.icpmoe}/?keyword=20260000"
				target="_blank"
				rel="noopener"
				class="focus-link inline-flex items-center gap-1.5 max-sm:hidden {stylex.attrs(
					surfaces.colorShift,
					styles.icpLink,
				).class}"
			>
				<Lollipop class="h-4 w-4" aria-hidden="true" />
				<span>ICP 20260000</span>
				<span class="sr-only">({m['support.new-tab']({}, { locale: data.locale.code })})</span>
			</a>
		</div>
	</article>
</main>

<Modal
	open={sponsorOpen}
	title={m['sponsor.title']({}, { locale: data.locale.code })}
	closeLabel={m['sponsor.close']({}, { locale: data.locale.code })}
	onOpenChange={(open) => (sponsorOpen = open)}
>
	{#snippet icon()}
		<Coffee class="size-4" aria-hidden="true" />
	{/snippet}
	{m['sponsor.notice']({}, { locale: data.locale.code })}
</Modal>

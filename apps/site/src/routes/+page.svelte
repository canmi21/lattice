<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, line, radius, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the home page. Every colour is the token variable `libs/tokens` already
	 * declares, so nothing here can change one. See spec/architecture/css.md.
	 *
	 * The two link styles below say the same thing twice at two sizes. They are written out
	 * rather than shared: a visual constant with two consumers wants a module of its own, and
	 * where that module should live is the question spec/todo.md is already holding.
	 */
	const styles = stylex.create({
		/**
		 * The page ground, and the selection policy that used to be this file's whole `<style>`
		 * block.
		 *
		 * The page is prose in a few places and controls everywhere else, and a drag that starts
		 * on a card or a button should not sweep up a date, a count and a label with it. So
		 * selection is off here and the parts that are sentences turn it back on for themselves,
		 * with `.selectable` in styles/utilities.css -- including the ones inside components this
		 * page only composes.
		 *
		 * Off by default rather than named per control, because the controls outnumber the prose
		 * and that list grows every time one is added. The prose does not.
		 *
		 * `-webkit-` is carried because Safari only dropped the prefix in 17 and the floor in
		 * spec/compat.md is 16. StyleX prefixes nothing on its own, so the rule this replaced
		 * wrote both and so does this. `user-select` is visual under
		 * spec/architecture/css.md: it moves nothing, it says what the element is to a pointer.
		 */
		page: {
			backgroundColor: 'var(--color-page)',
			color: 'var(--color-text)',
			WebkitUserSelect: 'none',
			userSelect: 'none',
		},
		avatar: {
			// `rounded-full` is `calc(infinity * 1px)` rather than a large length, and the
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
			// `leading-relaxed` is Tailwind's `--leading-relaxed`, and its value is written out
			// rather than read: that variable is emitted only for the utilities that name it, so
			// reading it here would leave this line depending on a class somewhere else in the
			// markup. The value terminates, so there is no arithmetic to round.
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
			// The whole of `transition-colors`, the three `--tw-gradient-*` variables included.
			// Nothing here sets a gradient and they animate nothing, but the measure of sameness
			// is the computed value and dropping them changes it. Whether the visual layer should
			// be naming another framework's private variables is in spec/todo.md.
			transitionProperty:
				'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to',
			transitionDuration: '200ms',
			transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
		},
		/** The registration badge sharing the row with them. */
		icpLink: {
			fontSize: text.px15,
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
			transitionProperty:
				'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to',
			transitionDuration: '200ms',
			transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
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
	import Newsletter from '$lib/newsletter/newsletter.svelte';
	import { CARD_HEIGHT, CARD_WIDTH, HOME_SLUG, cardUrl } from '$lib/opengraph';
	import * as m from '$lib/paraglide/messages';
	import { site } from '$lib/site';
	import Support from '$lib/support/support.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let sponsorOpen = $state(false);

	const cdnUrl = pageUrls(dev).cdn;
	const avatarSrc = imgsrc(`github:avatar:${site.author.githubId}@192`, { cdnUrl });
	const card = $derived(cardUrl(cdnUrl, HOME_SLUG, data.locale.code));
	const githubProfileUrl = `${URLS.external.github.web}/${site.author.github}`;
	const googleSourceUrl = new URL(URLS.external.google.sourcePreferences);
	googleSourceUrl.searchParams.set('q', URLS.apps.production.site);
	// Icons are center-anchored, so each is size-compensated independently. Base
	// matches the inline text icons (h-4); wide/flat glyphs (Telegram) get a larger
	// box to read optically equal.
	const base = 'h-4 w-4';
	// `document` keeps server-only resources out of the client page router.
	// See spec/locale.md#server-only-documents-leave-the-page-router.
	const links = [
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
		{ name: 'rss', label: 'RSS feed', href: '/atom.xml', size: base, document: true },
	] as const;
</script>

<svelte:head>
	<title>{data.title}</title>
	<meta name="description" content={data.description} />
	<!--
		The home page had no card at all, while `cms og` had been rendering one for it since the
		beginning. A page that advertises nothing is shared as a bare link, which is the one
		place a card is most worth having.
	-->
	<meta property="og:type" content="website" />
	<meta property="og:title" content={data.title} />
	<meta property="og:description" content={data.description} />
	<meta property="og:url" content={URLS.apps.production.site} />
	<meta property="og:image" content={card} />
	<meta property="og:image:width" content={CARD_WIDTH} />
	<meta property="og:image:height" content={CARD_HEIGHT} />
	<meta property="og:image:alt" content={data.title} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main class="min-h-screen {stylex.attrs(styles.page).class}">
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
				<h1 class="selectable {stylex.attrs(styles.name).class}">{site.author.fullName}</h1>
				<p class="selectable {stylex.attrs(styles.role).class}">{site.author.role}</p>
			</div>
		</header>

		<!-- Bio prose is compiled from contents/index.md (DLC directives), single-sourced
		with /llms.txt. PageBody keeps styled text as dead HTML and renders each social
		link live so its icon reuses the shared <Icon> component. -->
		<div class="selectable mt-8 space-y-4 {stylex.attrs(styles.bio).class}">
			<PageBody blocks={data.bio} locale={data.locale.code} />
		</div>

		<!-- Below the bio, not beside the name, because the bio is the one thing on this page the
		     switcher never changes: it is identity copy, rendered from the source in every view
		     (see spec/i18n.md). A language control sitting above text that will not move reads as
		     broken the first time somebody uses it. Here it sits where its effect starts, and is
		     still well inside the first screen at every width the site supports.

		     No heading and no rule. This is page furniture rather than a section, and the
		     preference it writes is the site's, not this page's -- a divider across the column
		     would say the opposite. -->
		<div class="mt-8 flex flex-wrap items-center gap-4 {stylex.attrs(styles.switcherRow).class}">
			<LanguageSwitcher code={data.locale.code} />
		</div>

		<ArticleList articles={data.articles} heading={data.writing} />

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

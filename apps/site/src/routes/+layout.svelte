<script lang="ts">
	import { browser, dev } from '$app/environment';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { settleBrevity, shortenTitles } from '@canmi/behavior/brevity';
	import { takeArrivalParameters } from '@canmi/referer';
	import {
		graph,
		ldJson,
		person,
		PERSON_ID,
		profiles,
		ref,
		SITE_ID,
	} from '@canmi/social/structured';
	import { hints, scriptPolicy } from '@canmi/hints';
	import { URLS } from '@canmi/urls';
	import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
	import { PersistQueryClientProvider } from '@tanstack/svelte-query-persist-client';
	import { advance, readTrail, writeTrail } from '$lib/article/trail';
	import { leaveArrival } from '@canmi/behavior/arrival';
	import { installFocusSourceTracker } from '$lib/client/focus-source';
	import { goTo, keepPlace, placeOf } from '$lib/client/scroll';
	import { followPointerKind, warmWhatThePointerRests } from '$lib/client/warm.svelte';
	import SearchDialog from '$lib/search/dialog.svelte';
	import { languageTag, localeUrl, SITE_LANGUAGE } from '$lib/locale';
	import { queryClient, QUERY_CACHE_MAX_AGE } from '$lib/query';
	import { site } from '$lib/site';
	import type { LayoutProps } from './$types';
	import '../styles/app.css';
	import '@canmi/fonts/mono.css';
	import { onMount } from 'svelte';

	// What the pages reach early, and how early. See spec/architecture/hints.md.
	const early = hints(
		{
			fonts: ['stylesheets', 'files'],
			ours: ['cdn'],
			api: ['public'],
			jsdelivr: { files: 'connect' },
			analytics: ['umami', 'umamiCloud', 'openpanel'],
		},
		{ dev },
	);
	const tracker = scriptPolicy('analytics', 'umami');
	const locale = $derived('locale' in page.data ? page.data.locale : undefined);
	const articleLocale = $derived(
		locale && 'canonical' in locale && 'alternates' in locale ? locale : undefined,
	);
	const canonical = $derived(
		articleLocale?.canonical ?? `${URLS.apps.production.site}${page.url.pathname}`,
	);
	const feed = $derived(localeUrl('/atom.xml', locale?.code ?? 'mw'));

	// Both once, for the whole site: the pointer's kind, and a listener that warms whatever it
	// rests on. Here rather than per page because a link to an article is not only a card -- see
	// $lib/client/warm.svelte.
	$effect(() => followPointerKind());
	$effect(() => warmWhatThePointerRests(() => locale?.code ?? 'mw'));

	/**
	 * The document's language, kept true after a switch that never reloads.
	 *
	 * The same answer `resolvedTag` in hooks.server.ts gives, by the same rule: an article's `mw`
	 * is its own language and travels in its view, every other `mw` is the site's. Here rather
	 * than in the article, which is where it was and why every other page kept claiming whatever
	 * the server wrote. See spec/locale/addressing.md.
	 */
	const languageOfDocument = $derived(
		articleLocale?.tag ?? languageTag(locale?.code ?? 'mw', SITE_LANGUAGE),
	);
	$effect(() => {
		document.documentElement.lang = languageOfDocument;
	});
	/**
	 * One robots directive per page, emitted in one place.
	 *
	 * It used to be a fixed `index, follow` in app.html, which meant a page wanting anything
	 * else appended a second, contradicting tag -- two directives that only behave because
	 * crawlers resolve a conflict by taking the most restrictive. Defaulting here instead lets
	 * a page replace the value rather than argue with it, and the default stays visible in the
	 * markup for every page that never thinks about it.
	 */
	const robots = $derived(
		'robots' in page.data && typeof page.data.robots === 'string'
			? page.data.robots
			: 'index, follow',
	);
	// The same client a universal load reaches for, not a second one beside it: a corpus answer
	// fetched during navigation and a counter fetched by a component belong in one cache, held for
	// one window. See $lib/query.
	const client = queryClient();
	const persister = createSyncStoragePersister({
		storage: browser ? localStorage : undefined,
		key: 'cache',
	});
	const persistOptions = {
		persister,
		maxAge: QUERY_CACHE_MAX_AGE,
		dehydrateOptions: {
			/**
			 * Persisted unless the answer belongs to one visitor.
			 *
			 * `localStorage` outlives the address a personal answer was keyed by, so a restored
			 * `liked` would mark a heart for whoever opens the browser next. A query says so with
			 * `meta.persist: false`; without this check the flag was documentation.
			 */
			shouldDehydrateQuery: (query: { state: { status: string }; meta?: { persist?: boolean } }) =>
				query.state.status === 'success' && query.meta?.persist !== false,
			shouldDehydrateMutation: () => false,
		},
	};
	let { children, data }: LayoutProps = $props();

	const PROFILES = profiles();

	// What a link carried in for analytics, out of the address. See spec/architecture/referer.md.
	onMount(() => {
		takeArrivalParameters();
		settleBrevity();
	});

	$effect(() => installFocusSourceTracker());

	/**
	 * StyleX's development stylesheet, linked behind a declaration of the layers above it.
	 *
	 * Why a bare `<link>` here inverts the cascade, why dropping it for the runtime module alone
	 * arrives too late, and the measurements behind both -- see spec/architecture/css/layers.md, "In
	 * development the visual layer arrives with its runtime, and must not be linked".
	 */
	const DEV_STYLEX =
		'<style>@layer properties, theme, base, components, utilities;</style>' +
		'<link rel="stylesheet" href="/virtual:stylex.css">';

	if (dev) {
		$effect(() => {
			void import('virtual:stylex:runtime');
		});
	}

	/**
	 * Cmd/Ctrl+I opens the report form, from wherever the reader is.
	 *
	 * `I` for issue, and the pair is the one the search dialog already uses -- one test covers a
	 * Mac and a PC because only one of the two modifiers is ever the platform's. It may not take
	 * Shift: `Cmd+Opt+I` and `Ctrl+Shift+I` are the developer tools, which a page cannot override.
	 *
	 * The form's widget is fetched by the press and not before, so a shortcut on every page costs
	 * every page nothing. See lib/error/report.ts.
	 */
	async function onWindowKeydown(event: KeyboardEvent): Promise<void> {
		// `key` is absent when the keydown did not come from the browser -- an extension or an
		// automation harness dispatching a plain Event under this name. See search/dialog.svelte,
		// where calling a string method on nothing threw for a reader mid-sentence.
		if (event.key?.toLowerCase() !== 'i' || !(event.metaKey || event.ctrlKey)) return;
		if (event.shiftKey || event.altKey) return;
		event.preventDefault();
		const { openReport } = await import('$lib/error/report');
		await openReport();
	}

	/**
	 * What the page being left has to be asked before it goes: where the reader was in it, and
	 * that the document has stopped being the one they arrived in.
	 *
	 * Before rather than after, because the navigation renders its page first and both answers
	 * would already be the new page's by then. See spec/styling/first-paint.md.
	 */
	beforeNavigate(({ from }) => {
		leaveArrival();
		if (from) keepPlace(sessionStorage, from.url.pathname, window.scrollY);
	});

	/**
	 * Record the reading trail, for every page rather than only articles.
	 *
	 * The Back control lives on an article, but the step it has to remember is often taken
	 * elsewhere -- the homepage, a licence page -- and a page that skipped recording would be a
	 * hole the next article's Back link falls into. `afterNavigate` covers the client navigations
	 * and the first load alike; on the first load `from` is null, which `advance` reads as "trust
	 * the record only if it claims this page". See $lib/article/trail.ts.
	 */
	afterNavigate(({ from, to, type }) => {
		if (!to) return;
		if (type !== 'enter') shortenTitles();
		writeTrail(
			sessionStorage,
			advance(readTrail(sessionStorage), to.url.pathname, from?.url.pathname),
		);

		// `enter` is a document the browser has already placed, `popstate` is one it restores
		// itself, and a fragment is an address that names where to be. What is left is the
		// navigation nothing else knows is a return. See spec/engagement.md, "A path keeps its
		// place, because Back is a link".
		if (type === 'enter' || type === 'popstate' || to.url.hash) return;
		const at = placeOf(sessionStorage, to.url.pathname);
		if (at !== undefined) goTo(at);
	});

	/**
	 * The site and its author, on every page: the graph each page's own nodes refer into. Built
	 * from the config the chrome reads, so the site's name is said once. See
	 * spec/architecture/entities.md.
	 */
	const entities = graph(
		{
			'@type': 'WebSite',
			'@id': SITE_ID,
			name: site.name,
			alternateName: site.author.name,
			description: site.tagline,
			url: URLS.apps.production.site,
			author: ref(PERSON_ID),
			publisher: ref(PERSON_ID),
		},
		person(),
	);
</script>

<svelte:window onkeydown={onWindowKeydown} />

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. -->
	{#if dev}{@html DEV_STYLEX}{/if}
	{#each early as hint (hint.href)}
		<link rel={hint.rel} href={hint.href} crossorigin={hint.crossorigin} />
	{/each}
	<link
		rel="stylesheet"
		href="{URLS.external.googleFonts
			.css}/css2?family=Inter:wght@400;500;600;700&family=Libre+Baskerville:ital@1&family=Noto+Sans+SC:wght@400;500;600;700&display=swap"
	/>
	<link rel="canonical" href={canonical} />
	<meta name="robots" content={robots} />
	{#each articleLocale?.alternates ?? [] as alternate (alternate.code)}
		<link rel="alternate" hreflang={alternate.language_tag} href={alternate.href} />
	{/each}
	<!-- Site-wide, so it sits here rather than being repeated by every page that has a card. -->
	<meta property="og:site_name" content={site.name} />
	<!-- The author, said in plain HTML beside the graph, and each of their accounts by `rel="me"`.
	     See spec/architecture/entities.md, "The head says who wrote it too". -->
	<meta name="author" content={site.author.name} />
	{#each PROFILES as profile (profile)}<link rel="me" href={profile} />{/each}
	{#if site.author.twitter}
		<meta name="twitter:site" content="@{site.author.twitter}" />
		<meta name="twitter:creator" content="@{site.author.twitter}" />
	{/if}
	<!-- Safe despite the raw insertion: ldJson escapes what it serialises. Stated rather than
	     suppressed, because no linter here checks it -- oxlint does not parse svelte templates
	     and has no svelte plugin, so a `svelte/no-at-html-tags` directive would be decoration.
	     See spec/lint-format.md. -->
	{@html ldJson(entities)}
	<link rel="alternate" type="application/atom+xml" href={feed} title={site.name} />
	<link rel="describedby" type="text/markdown" href="/llms.txt" />
	<!-- Each mark is the object the alias layer resolved it to at render; one that resolved to
	     nothing is left out. See +layout.server.ts. -->
	{#if data.marks['favicon-96x96.png']}
		<link rel="icon" type="image/png" sizes="96x96" href={data.marks['favicon-96x96.png']} />
	{/if}
	{#if data.marks['favicon-512x512.png']}
		<link rel="icon" type="image/png" sizes="512x512" href={data.marks['favicon-512x512.png']} />
	{/if}
	{#if data.marks['favicon.svg']}
		<link rel="icon" type="image/svg+xml" sizes="any" href={data.marks['favicon.svg']} />
	{/if}
	{#if data.marks['apple-touch-icon.png']}
		<link rel="apple-touch-icon" href={data.marks['apple-touch-icon.png']} />
	{/if}
	<!-- Loaded in development too; data-domains keeps a dev session from reporting.
	     See spec/analytics.md. -->
	<script
		defer={tracker.defer}
		fetchpriority={tracker.fetchpriority}
		src={URLS.external.umami}
		data-website-id="2b0a1e79-405a-47c0-a263-05732e0a130c"
		data-domains={new URL(URLS.apps.production.site).hostname}
		data-exclude="/@/*"
		data-exclude-hash="true"
	></script>
</svelte:head>

<PersistQueryClientProvider {client} {persistOptions}>
	{@render children()}
	<!-- Mounted once for the whole site rather than per page: the binding that opens it is global,
	     so a page that forgot to include it would be a hole in a site-wide shortcut. It renders
	     nothing until it is opened. -->
	<SearchDialog locale={locale?.code ?? 'mw'} />
</PersistQueryClientProvider>

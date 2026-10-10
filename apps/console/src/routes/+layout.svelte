<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { dev } from '$app/env';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { Live, provideLive } from '#lib/live.svelte.js';
	import { setView } from '#lib/scope/context.js';
	import { levelOf, titleOf } from '#lib/levels.js';
	import { viewOf } from '#lib/scope/scope.js';
	import { trackFocusSource } from '@canmi/kit/behavior/focus-source';
	import { discloseGlobals, disclosureHead } from '@canmi/web/disclose';
	import { CLIENT_TITLE, pageOf, statusText } from '@canmi/web/error';
	import Sidebar from '#lib/design/sidebar.svelte';
	import SkipLink from '#lib/design/skip-link.svelte';
	import TopBar from '#lib/design/top-bar.svelte';
	import { provideActions } from '#lib/ui/actions.svelte.js';
	import { goTo, holdTag, keepPlace, placeIn, placeOf, placeTag } from '#lib/ui/place.js';
	import { setTimeZone, settle } from '#lib/ui/time-zone.js';
	// The shell's face, its CDN filled in by the build; see vite.config.ts.
	import '@canmi/fonts/mono.css';
	import '../app.css';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Once, from the server's load: every chart and time below writes the reader's zone, which the
	// browser corrects where the server drew on a guess; see src/lib/ui/time-zone.ts.
	const zone = $state({ ...untrack(() => data.zone) });
	setTimeZone(zone);
	onMount(() => settle(zone));

	/**
	 * The visual layer in development, linked as the panel links it: the layer order first, then the
	 * sheet. See spec/architecture/css/layers.md, "In development the visual layer arrives with
	 * its runtime, and must not be linked".
	 */
	const DEV_STYLEX =
		'<style>@layer properties, theme, base, components, utilities;</style>' +
		'<link rel="stylesheet" href="/virtual:stylex.css">';

	if (dev) {
		$effect(() => {
			void import('virtual:stylex:runtime');
		});
	}

	const live = provideLive(new Live());
	const actions = provideActions();

	/** A scope where the address's first segment names one, All where it does not. */
	const view = $derived(viewOf(page.params.scope));
	setView(() => view);

	/**
	 * Every page's load hands on the cluster: read already for the document's own response, so it
	 * is taken in at once and the server draws from it, and streamed on a move, taken in when it
	 * lands unless a newer load's has replaced it by then; the socket keeps the store after that.
	 * See spec/architecture/console.md.
	 */
	let latest: unknown;
	function seed() {
		const read = page.data.cluster;
		latest = read;
		const take = (one: Awaited<typeof read>) => {
			if (one?.ok && read === latest) untrack(() => live.seed(one.data));
		};
		if (read instanceof Promise) void read.then(take);
		else take(read);
	}
	// Once now, and again on each load after.
	seed();
	$effect.pre(() => seed());

	// On mount, not in an effect: an effect reruns on what it reads, reopening the socket.
	onMount(() => live.start());
	// What the last input was, so a press known to be a pointer draws no focus ring; see
	// spec/console/design.md, "Accessibility".
	onMount(() => trackFocusSource());

	/**
	 * The page scrolls inside `main`, so its place is the console's to keep: a path arrived at
	 * returns to where this tab left it, else its top, and the place is kept as it moves. See
	 * spec/console/state.md, "A place comes back as near as the page still allows".
	 */
	let scroller: HTMLElement | undefined = $state();
	/** The path whose place is being kept; none between a navigation and its arrival. */
	let placing: string | undefined;
	afterNavigate(({ from, to }) => {
		const path = to?.url.pathname;
		if (!scroller || !path) return;
		if (from?.url.pathname !== path) {
			const place = placeOf(sessionStorage, path);
			// Come fresh to an anchor the address names: the one arrival carried there in motion.
			const named = !place && !from && to.url.hash;
			const anchor = named
				? document.getElementById(decodeURIComponent(to.url.hash.slice(1)))
				: null;
			if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
			else goTo(scroller, place);
		}
		placing = path;
	});
	let pending = false;
	function moved() {
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => {
			pending = false;
			// A scroll while the next page replaces this one is neither page's place.
			if (!scroller || placing !== page.url.pathname) return;
			keepPlace(sessionStorage, placing, placeIn(scroller));
		});
	}

	/** Where the reader is, which the sidebar, the trail and the title are drawn from. */
	// An error's page drills into nothing: a node, app or run the address names may not exist.
	const where = $derived({
		url: page.url,
		view,
		node: page.error ? undefined : page.params.node,
		app: page.error ? undefined : page.params.app,
		run: page.error ? undefined : page.params.run,
	});
	const level = $derived(levelOf(where));
	/** An error's page is named as the protocol names its status, or the failure it has none for. */
	const name = $derived(
		page.error
			? pageOf(page.error) === 'client'
				? CLIENT_TITLE
				: `${page.status} ${statusText(page.status)}`
			: titleOf(level, where),
	);

	// What the app is made of, said for Wappalyzer from the build; see lib's spec/web/disclose.md.
	const disclosure = import.meta.env.VITE_DISCLOSURE;
	discloseGlobals(disclosure);
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. -->
	{#if dev}{@html DEV_STYLEX}{/if}
	{@html disclosureHead(disclosure)}
	<title>{name}</title>
	<!-- The main area held back while a reload finds its place; see src/lib/ui/place.ts. -->
	{@html holdTag}
</svelte:head>

<!-- Three fixed regions, and only the page scrolls. See spec/architecture/console.md. -->
<SkipLink />
<Sidebar {level} {live} nearest={data.nearest} />
<TopBar {view} section={level.section} trail={level.trail} actions={actions.current} />
<main
	id="content"
	tabindex="-1"
	bind:this={scroller}
	onscroll={moved}
	class="fixed top-14 right-0 bottom-0 left-60 overflow-y-auto overscroll-contain"
>
	<div class="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-8 pt-8 pb-12">
		{@render children()}
	</div>
</main>
<!-- A reload at its place before the first frame, which the hydrated page would reach a frame
     late; see src/lib/ui/place.ts. Run as the document is parsed, never again. -->
{@html placeTag}

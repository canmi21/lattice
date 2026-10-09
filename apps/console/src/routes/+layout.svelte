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
	import Sidebar from '#lib/design/sidebar.svelte';
	import SkipLink from '#lib/design/skip-link.svelte';
	import TopBar from '#lib/design/top-bar.svelte';
	import { provideActions } from '#lib/ui/actions.svelte.js';
	import { setTimeZone } from '#lib/ui/time-zone.js';
	// The shell's face, its CDN filled in by the build; see vite.config.ts.
	import '@canmi/fonts/mono.css';
	import '../app.css';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Once, from the server's load: every chart and time below writes the reader's zone.
	setTimeZone(untrack(() => data.zone));

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
	 * Every page streams the cluster from its load, and what it read is taken in when it lands,
	 * unless a newer load's has replaced it by then; the socket keeps the store after that. See
	 * spec/architecture/console.md.
	 */
	let latest: Promise<unknown> | undefined;
	async function seed() {
		const read = page.data.cluster;
		latest = read;
		const one = await read;
		if (one?.ok && read === latest) untrack(() => live.seed(one.data));
	}
	// Once now, and again on each load after.
	void seed();
	$effect.pre(() => void seed());

	// On mount, not in an effect: an effect reruns on what it reads, reopening the socket.
	onMount(() => live.start());
	// What the last input was, so a press known to be a pointer draws no focus ring; see
	// spec/console/design.md, "Accessibility".
	onMount(() => trackFocusSource());

	/** The page scrolls inside `main`, so a new path starts at its top as the window would. */
	let scroller: HTMLElement | undefined = $state();
	afterNavigate(({ from, to }) => {
		if (from?.url.pathname !== to?.url.pathname) scroller?.scrollTo({ top: 0 });
	});

	/** Where the reader is, which the sidebar, the trail and the title are drawn from. */
	const where = $derived({
		url: page.url,
		view,
		node: page.params.node,
		app: page.params.app,
		run: page.params.run,
	});
	const level = $derived(levelOf(where));
	const name = $derived(titleOf(level, where));
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. -->
	{#if dev}{@html DEV_STYLEX}{/if}
	<title>{name}</title>
</svelte:head>

<!-- Three fixed regions, and only the page scrolls. See spec/architecture/console.md. -->
<SkipLink />
<Sidebar {level} {live} nearest={data.nearest} />
<TopBar {view} section={level.section} trail={level.trail} actions={actions.current} />
<main
	id="content"
	tabindex="-1"
	bind:this={scroller}
	class="fixed top-14 right-0 bottom-0 left-60 overflow-y-auto overscroll-contain"
>
	<div class="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-8 pt-8 pb-12">
		{@render children()}
	</div>
</main>

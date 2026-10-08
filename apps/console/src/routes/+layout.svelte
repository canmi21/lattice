<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { dev } from '$app/env';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { Live, provideLive } from '#lib/live.svelte.js';
	import { nameOf } from '#lib/map/places.js';
	import { setView } from '#lib/scope/context.js';
	import { displayOf, viewOf } from '#lib/scope/scope.js';
	import { sectionOf, sectionsIn } from '#lib/sections.js';
	import Sidebar from '#lib/sidebar.svelte';
	import TopBar from '#lib/top-bar.svelte';
	import { provideActions } from '#lib/ui/actions.svelte.js';
	import { setTimeZone } from '#lib/ui/time-zone.js';
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

	/** The page scrolls inside `main`, so a new path starts at its top as the window would. */
	let scroller: HTMLElement | undefined = $state();
	afterNavigate(({ from, to }) => {
		if (from?.url.pathname !== to?.url.pathname) scroller?.scrollTo({ top: 0 });
	});

	/** None for a section the view does not show, as Nodes in Services, whose page is a 404. */
	const section = $derived.by(() => {
		const one = sectionOf(page.url.pathname);
		return one && sectionsIn(view).includes(one) ? one : undefined;
	});
	/** A node or an app by its display name, its code beside it; see spec/architecture/console.md. */
	const node = $derived(page.params.node);
	const app = $derived(page.params.app);
	const detail = $derived(node ? nameOf(node).full : app ? displayOf(app) : page.params.run);
	const code = $derived(node ?? app);
	/** The one name the page is about, and nothing around it. See spec/architecture/console.md. */
	const name = $derived(
		page.params.run ? `#${page.params.run}` : (code ?? detail ?? section?.label ?? 'Console'),
	);
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. -->
	{#if dev}{@html DEV_STYLEX}{/if}
	<title>{name}</title>
</svelte:head>

<!-- Three fixed regions, and only the page scrolls. See spec/architecture/console.md. -->
<Sidebar {view} current={section} {live} nearest={data.nearest} />
<TopBar
	{view}
	{section}
	{detail}
	code={detail === code ? undefined : code}
	actions={actions.current}
/>
<main
	bind:this={scroller}
	class="fixed top-14 right-0 bottom-0 left-60 overflow-y-auto overscroll-contain"
>
	<div class="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-8 pt-8 pb-12">
		{@render children()}
	</div>
</main>

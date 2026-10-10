<script lang="ts">
	import type { Snippet } from 'svelte';
	import { dev } from '$app/env';
	import { discloseGlobals, disclosureHead } from '@canmi/web/disclose';
	import '@canmi/fonts/mono.css';
	import '../app.css';

	let { children }: { children: Snippet } = $props();

	/**
	 * The visual layer in development, linked as the console links it: the layer order first, then
	 * the sheet. See spec/architecture/css/layers.md, "In development the visual layer arrives with
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

	// What the app is made of, said for Wappalyzer from the build; see lib's spec/web/disclose.md.
	const disclosure = import.meta.env.VITE_DISCLOSURE;
	discloseGlobals(disclosure);

	/**
	 * The parts of space, each a path of canmi.app until it grows into an app of its own. The docs
	 * and the specs join once written for readers; see spec/issues/space.md.
	 */
	const PARTS = [{ href: '/design', label: 'Design' }];
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. -->
	{#if dev}{@html DEV_STYLEX}{/if}
	{@html disclosureHead(disclosure)}
</svelte:head>

<header class="flex items-center gap-6 px-6 py-4">
	<a href="/" class="font-medium">canmi.app</a>
	<nav class="flex gap-4 text-(--color-text-muted)">
		{#each PARTS as part (part.href)}
			<a href={part.href}>{part.label}</a>
		{/each}
	</nav>
</header>

<main class="px-6 py-8">
	{@render children()}
</main>

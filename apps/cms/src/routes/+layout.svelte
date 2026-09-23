<script lang="ts">
	/**
	 * What every route needs whatever it looks like: the stylesheet and, in development, the visual
	 * layer's runtime. The ground and its pane are `(pane)/+layout.svelte`'s, because the preview
	 * is drawn outside them -- it is the site's own page, and it scrolls the window.
	 */
	import '../styles/app.css';
	import { dev } from '$app/environment';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	/**
	 * The visual layer the preview is drawn with, linked the way the site links it.
	 *
	 * The article components are StyleX, and in development StyleX's sheet arrives through a
	 * link plus a runtime module rather than an import -- see spec/architecture/css/layers.md,
	 * "In development the visual layer arrives with its runtime, and must not be linked", for why
	 * the layer declaration has to come first and why the runtime alone is too late.
	 */
	const DEV_STYLEX =
		'<style>@layer properties, theme, base, components, utilities;</style>' +
		'<link rel="stylesheet" href="/virtual:stylex.css">';

	if (dev) {
		$effect(() => {
			void import('virtual:stylex:runtime');
		});
	}
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. Raw on
	     purpose too, and stated rather than suppressed -- oxlint does not parse svelte templates,
	     so a `svelte/no-at-html-tags` directive would be decoration. See spec/lint-format.md. -->
	{#if dev}{@html DEV_STYLEX}{/if}
</svelte:head>

{@render children()}

<script lang="ts">
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

<main>
	<a class="home" href="/">collection</a>
	{@render children()}
</main>

<style>
	:global(body) {
		margin: 0;
		background: var(--color-paper, #fff);
		color: var(--color-text-strong, #111);
		font-family: ui-sans-serif, system-ui, sans-serif;
	}

	main {
		max-width: 48rem;
		margin: 0 auto;
		padding: 2rem 1rem 6rem;
	}

	.home {
		display: inline-block;
		margin-bottom: 2rem;
		color: var(--color-text-soft, #666);
		font-size: 0.8125rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-decoration: none;
	}
</style>

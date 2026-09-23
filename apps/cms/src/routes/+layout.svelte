<script lang="ts">
	import '@canmi/tokens/colors.css';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

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

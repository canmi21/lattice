<script lang="ts">
	import { HOSTS } from '#lib/hosts.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const host = $derived(HOSTS[data.host]);
</script>

<svelte:head>
	<title>{host.name}</title>
	<meta name="description" content={host.line} />
</svelte:head>

<section class="py-24">
	<h1 class="text-3xl font-semibold tracking-tight text-text-strong">{host.name}</h1>
	<p class="mt-3 text-text-soft">{host.line}</p>
</section>

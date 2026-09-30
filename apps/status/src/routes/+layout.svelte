<script lang="ts">
	import { URLS } from '@canmi/urls';
	import type { Snippet } from 'svelte';
	import { dev } from '$app/environment';
	import '../app.css';

	let { children }: { children: Snippet } = $props();

	/**
	 * The visual layer in development, linked as the site and the panel link it: the layer order
	 * first, then the sheet. See spec/architecture/css/layers.md, "In development the visual layer
	 * arrives with its runtime, and must not be linked".
	 */
	const DEV_STYLEX =
		'<style>@layer properties, theme, base, components, utilities;</style>' +
		'<link rel="stylesheet" href="/virtual:stylex.css">';

	if (dev) {
		$effect(() => {
			void import('virtual:stylex:runtime');
		});
	}

	const { canonical, mirror } = URLS.internal.status;
	/** The status page's icon, by its content id in the objects bucket. */
	const FAVICON = '484b05c1ab8c6800371c862e4f071d73';

	// Where this page reports to: the gateway's `umami` scope, on the public API host. Not a
	// literal URL, since the address is `libs/urls`' to declare. See spec/analytics.md, "umami,
	// self-hosted, for the pages that matter less".
	const umamiHostUrl = `${URLS.internal.api.public}/umami`;
	// This page's production hostnames, so a dev build stays silent: the two doors of its own
	// (canonical, mirror) and the platform door, which also loads this tracker. See
	// spec/analytics.md, "Development loads the client and reports nothing".
	const umamiDomains = [canonical, mirror, URLS.internal.app]
		.map((url) => new URL(url).hostname)
		.join(',');
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. -->
	{#if dev}{@html DEV_STYLEX}{/if}
	<!-- Every door names the one address, so three doors are one page to an index. -->
	<link rel="canonical" href={new URL('/', canonical).href} />
	<!-- Content-addressed on the CDN, so its name is its bytes. See spec/architecture/probe.md. -->
	<link
		rel="icon"
		type="image/svg+xml"
		href={`${URLS.apps.production.cdn}/object/${FAVICON}.svg`}
	/>
	<!-- Resolved early, not connected early: the same trade the site makes for its own tracker.
	     See spec/analytics.md, "The analytics hosts are resolved early, not connected early". -->
	<link rel="dns-prefetch" href={new URL(URLS.external.umami).origin} />
	<!-- Loaded in development too; data-domains keeps a dev session from reporting.
	     See spec/analytics.md. -->
	<script
		defer
		src={URLS.external.umami}
		data-website-id="6dea3b82-46a0-4baf-8585-b9138cea5296"
		data-host-url={umamiHostUrl}
		data-domains={umamiDomains}
	></script>
</svelte:head>

{@render children()}

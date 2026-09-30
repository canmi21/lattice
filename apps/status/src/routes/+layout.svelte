<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, text, weight } from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The shell's own recipes: the nav's hairline bottom border and its two type sizes, plus the
	 * link colour states neither Tailwind nor a bare `<a>` can name. See
	 * spec/architecture/css/layers.md and spec/styling/palettes.md.
	 */
	const styles = stylex.create({
		nav: {
			borderBottomWidth: border.hairlinePx,
			borderBottomStyle: 'solid',
			borderBottomColor: 'var(--color-border)',
		},
		brand: {
			fontSize: text.px14,
			fontWeight: weight.medium,
			color: 'var(--color-text-strong)',
		},
		link: {
			fontSize: text.px13,
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
		},
	});
</script>

<script lang="ts">
	import { hints, scriptPolicy } from '@canmi/hints';
	import { URLS } from '@canmi/urls';
	import type { Snippet } from 'svelte';
	import { dev } from '$app/environment';
	import { projectUrl } from '$lib/source';
	import '../app.css';

	const project = projectUrl();

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

	// What the page reaches early, and how early. See spec/architecture/hints.md.
	const early = hints(
		{
			fonts: ['stylesheets', 'files'],
			api: ['public'],
			...(project ? { data: { status: project } } : {}),
			analytics: ['umami'],
		},
		{ dev },
	);
	const tracker = scriptPolicy('analytics', 'umami');
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
	{#each early as hint (hint.href)}
		<link rel={hint.rel} href={hint.href} crossorigin={hint.crossorigin} />
	{/each}
	<!-- Loaded in development too; data-domains keeps a dev session from reporting.
	     See spec/analytics.md. -->
	<script
		defer={tracker.defer}
		fetchpriority={tracker.fetchpriority}
		src={URLS.external.umami}
		data-website-id="6dea3b82-46a0-4baf-8585-b9138cea5296"
		data-host-url={umamiHostUrl}
		data-domains={umamiDomains}
	></script>
</svelte:head>

<nav
	class="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 {stylex.attrs(styles.nav).class}"
>
	<span class={stylex.attrs(styles.brand).class}>Status</span>
	<div class="flex items-center gap-4 sm:gap-6">
		<a href={URLS.apps.production.site} class="focus-link {stylex.attrs(styles.link).class}">
			Site
		</a>
		<a href={URLS.internal.app} class="focus-link {stylex.attrs(styles.link).class}"> Platform </a>
	</div>
</nav>

<main class="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
	{@render children()}
</main>

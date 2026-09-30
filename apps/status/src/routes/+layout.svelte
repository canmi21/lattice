<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, easing, text, weight } from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The shell's own recipes: the nav's background and its hairline bottom border -- transparent
	 * at rest, coloured once scrolled, its width never changing -- its two type sizes, and the
	 * link colour states neither Tailwind nor a bare `<a>` can name. See
	 * spec/architecture/css/layers.md and spec/styling/palettes.md.
	 */
	const styles = stylex.create({
		nav: {
			backgroundColor: 'var(--color-page)',
			borderBottomWidth: border.hairlinePx,
			borderBottomStyle: 'solid',
			borderBottomColor: 'transparent',
			transitionProperty: 'border-color',
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0ms',
			},
			transitionTimingFunction: easing.inOut,
		},
		navBorderVisible: {
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

	/**
	 * The one width every route inside this layout lines up on: the nav's inner row and `<main>`
	 * share it character for character, so their edges land on the same pixel. Not a Tailwind
	 * scale step, so it is the arbitrary value rather than a name -- see
	 * spec/architecture/css/layers.md, "The frame stays in the markup because structure is what
	 * the markup is".
	 */
	const CONTAINER = 'mx-auto w-full max-w-[51.25rem] px-4 sm:px-6';
</script>

<script lang="ts">
	import { hints, scriptPolicy } from '@canmi/hints';
	import { URLS } from '@canmi/urls';
	import type { Snippet } from 'svelte';
	import { dev } from '$app/environment';
	import { resolve } from '$app/paths';
	import { projectUrl } from '$lib/source';
	import '../app.css';

	const project = projectUrl();

	let { children }: { children: Snippet } = $props();

	/**
	 * Whether the page has scrolled past its top, which is the only thing the nav's hairline
	 * border answers to. A 1px sentinel in the normal flow, ahead of the nav, costs no layout of
	 * its own -- it has no height -- and an `IntersectionObserver` on it costs no per-frame scroll
	 * work either. SSR has no window to observe, so the border starts absent and only ever turns
	 * on once a browser is watching.
	 */
	let scrolled = $state(false);
	let sentinel: HTMLElement | undefined;

	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(([entry]) => {
			scrolled = !(entry?.isIntersecting ?? true);
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

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

<div bind:this={sentinel} class="h-0 w-full" aria-hidden="true"></div>

<nav
	class="sticky top-0 z-20 {stylex.attrs(styles.nav, scrolled && styles.navBorderVisible).class}"
>
	<div class="flex h-14 items-center justify-between gap-4 {CONTAINER}">
		<a
			href={resolve('/')}
			class="focus-link flex items-center gap-2 {stylex.attrs(styles.brand).class}"
		>
			<img
				src={`${URLS.apps.production.cdn}/object/${FAVICON}.svg`}
				alt=""
				width="24"
				height="24"
				class="size-6"
			/>
			Status
		</a>
		<div class="flex items-center gap-4 sm:gap-6">
			<a href={URLS.apps.production.site} class="focus-link {stylex.attrs(styles.link).class}">
				Site
			</a>
			<a href={URLS.internal.app} class="focus-link {stylex.attrs(styles.link).class}"> Platform </a>
		</div>
	</div>
</nav>

<main class="{CONTAINER} py-10 sm:py-12">
	{@render children()}
</main>

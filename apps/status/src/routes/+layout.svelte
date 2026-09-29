<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import {
		border,
		duration,
		easing,
		family,
		leading,
		radius,
		text,
		transition,
		weight,
	} from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The visual half of the frame around every screen. Colours are palette names, read rather
	 * than retyped. See spec/architecture/css/authoring.md.
	 */
	const styles = stylex.create({
		// The ground, its ink and the interface's own step, set once for every screen.
		ground: {
			backgroundColor: 'var(--color-page)',
			color: 'var(--color-text)',
			fontSize: text.px14,
			lineHeight: leading.px20,
		},
		// How a colour change is drawn, as the site's `colorShift` draws it.
		shift: {
			transitionProperty: transition.colors,
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
		bar: {
			borderBottomWidth: border.hairlinePx,
			borderBottomStyle: 'solid',
			borderBottomColor: 'var(--color-border)',
		},
		mark: {
			color: 'var(--color-text-strong)',
			fontFamily: family.monoTheme,
			fontSize: text.px14,
			lineHeight: leading.px20,
			fontWeight: weight.semibold,
		},
		link: {
			borderRadius: radius.full,
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
			backgroundColor: {
				default: null,
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-paper-hover)' },
			},
		},
		foot: {
			borderTopWidth: border.hairlinePx,
			borderTopStyle: 'solid',
			borderTopColor: 'var(--color-border)',
			color: 'var(--color-text-soft)',
		},
		door: {
			color: {
				default: 'var(--color-text-muted)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
			},
		},
	});
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { URLS } from '@canmi/urls';
	import type { Snippet } from 'svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
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
	const host = (url: string) => new URL(url).host;
	const platform = [
		{ href: URLS.apps.production.site, label: host(URLS.apps.production.site) },
		{ href: URLS.internal.app, label: host(URLS.internal.app) },
	];

	// Where this page reports to: the gateway's `umami` scope, on the public API host. Not a
	// literal URL, since the address is `libs/urls`' to declare. See spec/analytics.md, "umami,
	// self-hosted, for the pages that matter less".
	const umamiHostUrl = `${URLS.internal.api.public}/umami`;
	// This page's production hostnames, so a dev build stays silent: the two doors of its own
	// (canonical, mirror) and the platform door it links to, which also loads this tracker. See
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

<div class="flex min-h-dvh flex-col {stylex.attrs(styles.ground).class}">
	<header class={stylex.attrs(styles.bar).class}>
		<nav
			class="mx-auto flex h-14 max-w-180 items-center justify-between gap-4 px-4 sm:px-6"
			aria-label="Platform"
		>
			<a href={resolve('/')} class="focus-ring {stylex.attrs(styles.mark).class}">status</a>
			<div class="-mr-1.5 flex items-center gap-0.5">
				{#each platform as link (link.href)}
					<a
						href={link.href}
						class="focus-ring px-2.5 py-1 {stylex.attrs(styles.shift, styles.link).class}"
					>
						{link.label}
					</a>
				{/each}
				<ThemeToggle />
			</div>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-180 flex-1 px-4 pt-12 pb-20 sm:px-6 sm:pt-20">
		{@render children()}
	</main>

	<footer class={stylex.attrs(styles.foot).class}>
		<div class="mx-auto max-w-180 px-4 py-8 sm:px-6">
			<p>
				This page is <a
					class="focus-ring underline decoration-border-strong underline-offset-4 {stylex.attrs(
						styles.shift,
						styles.door,
					).class}"
					href={canonical}>{host(canonical)}</a
				>. When that name does not resolve, the same page is at
				<a
					class="focus-ring underline decoration-border-strong underline-offset-4 {stylex.attrs(
						styles.shift,
						styles.door,
					).class}"
					href={mirror}>{host(mirror)}</a
				>.
			</p>
		</div>
	</footer>
</div>

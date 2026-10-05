<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import {
		border,
		duration,
		easing,
		leading,
		radius,
		text,
		transition,
	} from '@canmi/kit/tokens/vocabulary.stylex';

	/** The shell's recipes. See spec/architecture/css/layers.md and spec/styling/palettes.md. */
	const styles = stylex.create({
		nav: {
			backgroundColor: 'var(--color-page)',
			boxShadow: '0 1px 0 0 transparent',
			transitionProperty: 'box-shadow',
			transitionDuration: {
				default: '180ms', // unnamed
				'@media (prefers-reduced-motion: reduce)': '0ms',
			},
			transitionTimingFunction: easing.inOut,
		},
		// The text colour at 4%, shown once the page has scrolled.
		navBorderVisible: {
			boxShadow: '0 1px 0 0 color-mix(in oklch, var(--color-text) 4%, transparent)',
		},
		wordmark: {
			fontSize: '1.0625rem', // unnamed
			fontWeight: 700, // unnamed
			color: 'var(--color-text-strong)',
		},
		rule: {
			backgroundColor: 'var(--color-border-strong)',
		},
		byline: {
			fontSize: text.px12,
			letterSpacing: '-0.03em', // unnamed
			textDecorationLine: 'none',
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
			},
		},
		toggle: {
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
			},
			backgroundColor: {
				default: 'transparent',
				'@media (hover: hover)': {
					default: null,
					':hover': 'color-mix(in oklch, var(--color-text) 6%, transparent)',
				},
			},
			borderRadius: radius.full,
		},
		footer: {
			fontSize: text.px14,
			lineHeight: leading.px20,
			color: 'var(--color-text)',
			borderTopWidth: border.hairlinePx,
			borderTopStyle: 'solid',
			borderTopColor: 'color-mix(in oklch, var(--color-text) 8%, transparent)',
		},
		// The social row's links: soft, strong on hover or keyboard focus.
		social: {
			transitionProperty: transition.colors,
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
			borderRadius: '0.3125rem', // unnamed
			color: {
				default: 'var(--color-text)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
		},
		button: {
			fontSize: text.px14,
			fontWeight: 510, // unnamed
			color: 'var(--color-paper)',
			backgroundColor: {
				default: 'var(--color-ink)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
			},
			borderRadius: radius.full,
		},
	});

	/**
	 * The column the nav's row, `<main>` and the footer share: 64.5rem, centered; a 1.5rem gutter
	 * below 67.5rem, 1rem below 37.5rem.
	 */
	const CONTAINER =
		'mx-auto w-[min(100%,64.5rem)] max-[67.5rem]:mx-6 max-[67.5rem]:w-auto max-[37.5rem]:mx-4';
</script>

<script lang="ts">
	import { settleBrevity } from '@canmi/kit/behavior/brevity';
	import { takeArrivalParameters } from '@canmi/web/referer';
	import { hints } from '@canmi/hints';
	import { URLS } from '@monoflake/sdk';
	import Globe from '@lucide/svelte/icons/globe';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { applyTheme, currentTheme, themeCookie } from '@canmi/kit/theme';
	import { author } from '@canmi/me/identity';
	import { profiles } from '@canmi/social/structured';
	import { ACCOUNTS } from '@canmi/social';
	import SocialLinks from '@canmi/social/social-links.svelte';
	import { onMount, type Snippet } from 'svelte';
	import { dev } from '$app/env';
	import { resolve } from '$app/paths';
	import { HOSTS } from '#lib/hosts.js';
	import type { LayoutData } from './$types';
	import '../app.css';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	function toggleTheme() {
		const next = currentTheme() === 'dark' ? 'light' : 'dark';
		applyTheme(next);
		document.cookie = themeCookie(next);
	}

	// What a link carried in for analytics, out of the address. See spec/architecture/referer.md.
	onMount(() => {
		takeArrivalParameters();
		settleBrevity();
	});

	/** Whether the page has scrolled, read off a zero-height sentinel above the nav; false in SSR. */
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

	const host = $derived(HOSTS[data.host]);
	/** The site, marked as reached from here. */
	const SITE = $derived(`${URLS.apps.production.site}?ref=${host.name}`);
	const GITHUB = `${URLS.external.github.web}/${author.github}`;
	const PROFILES = profiles();

	// What the page reaches early, and how early. See spec/architecture/hints.md.
	const early = hints({ fonts: ['stylesheets', 'files'] }, { dev });
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. -->
	{#if dev}{@html DEV_STYLEX}{/if}
	<!-- Each host is its own page, at its own root. -->
	<link rel="canonical" href="https://{data.host}/" />
	<!-- The author, said in plain HTML beside the graph, and each of their accounts by `rel="me"`.
	     See spec/architecture/entities.md, "The head says who wrote it too". -->
	<meta name="author" content={author.name} />
	{#each PROFILES as profile (profile)}<link rel="me" href={profile} />{/each}
	{#if author.twitter}<meta name="twitter:creator" content="@{author.twitter}" />{/if}
	<!-- Each mark is the object the alias layer resolved it to at render; one that resolved to
	     nothing is left out. See +layout.server.ts. -->
	{#if data.marks['favicon.ico']}<link
			rel="icon"
			href={data.marks['favicon.ico']}
			sizes="32x32"
		/>{/if}
	{#if data.marks['favicon-96x96.png']}
		<link rel="icon" type="image/png" sizes="96x96" href={data.marks['favicon-96x96.png']} />
	{/if}
	{#if data.marks['favicon-512x512.png']}
		<link rel="icon" type="image/png" sizes="512x512" href={data.marks['favicon-512x512.png']} />
	{/if}
	{#if data.marks['favicon.svg']}
		<link rel="icon" type="image/svg+xml" href={data.marks['favicon.svg']} />
	{/if}
	{#if data.marks['apple-touch-icon.png']}
		<link rel="apple-touch-icon" href={data.marks['apple-touch-icon.png']} />
	{/if}
	{#each early as hint (hint.href)}
		<link rel={hint.rel} href={hint.href} crossorigin={hint.crossorigin} />
	{/each}
</svelte:head>

<div bind:this={sentinel} class="h-0 w-full" aria-hidden="true"></div>

<nav
	class="sticky top-0 z-20 {stylex.attrs(styles.nav, scrolled && styles.navBorderVisible).class}"
>
	<div class="flex min-h-14 items-center justify-between gap-4 py-3 {CONTAINER}">
		<div class="flex h-9 items-center gap-1.5">
			<a href={resolve('/')} class="focus-ring flex items-center gap-1.5 rounded-md">
				<img src={data.marks['favicon.svg']} alt="" width="28" height="28" class="size-7" />
				<span class={stylex.attrs(styles.wordmark).class}>{host.name}</span>
			</a>
			<span class="mx-1 h-[13px] w-px {stylex.attrs(styles.rule).class}" aria-hidden="true"></span>
			<a
				href={GITHUB}
				target="_blank"
				rel="noopener"
				class="focus-ring rounded-sm {stylex.attrs(styles.byline).class}"
			>
				by {author.name}
			</a>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={toggleTheme}
				aria-label="Switch between light and dark"
				class="focus-ring inline-flex size-8 items-center justify-center {stylex.attrs(
					styles.toggle,
				).class}"
			>
				<Moon size={16} aria-hidden="true" class="dark:hidden" />
				<Sun size={16} aria-hidden="true" class="hidden dark:block" />
			</button>
			<a
				href={SITE}
				target="_blank"
				rel="noopener"
				class="focus-ring inline-flex h-8 items-center gap-1.5 py-1.5 pr-3 pl-2.5 {stylex.attrs(
					styles.button,
				).class}"
			>
				<Globe size={16} aria-hidden="true" />
				Site
			</a>
		</div>
	</div>
</nav>

<main class="{CONTAINER} pb-16">
	{@render children()}
</main>

<footer class="pt-10 pb-16">
	<div
		class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-6 {CONTAINER} {stylex.attrs(
			styles.footer,
		).class}"
	>
		<p>
			© {data.year}
			<a
				href={SITE}
				target="_blank"
				rel="noopener"
				class="focus-ring rounded-sm {stylex.attrs(styles.social).class}">{author.name}</a
			>
		</p>
		<SocialLinks
			entries={ACCOUNTS}
			newTab="opens in new tab"
			scale="1rem"
			linkClass={stylex.attrs(styles.social).class}
		/>
	</div>
</footer>

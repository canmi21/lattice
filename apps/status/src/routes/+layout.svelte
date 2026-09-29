<script lang="ts">
	import { resolve } from '$app/paths';
	import { URLS } from '@canmi/urls';
	import type { Snippet } from 'svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import '../app.css';

	let { children }: { children: Snippet } = $props();

	const { canonical, mirror } = URLS.internal.status;
	const host = (url: string) => new URL(url).host;
	const platform = [
		{ href: URLS.apps.production.site, label: host(URLS.apps.production.site) },
		{ href: URLS.internal.app, label: host(URLS.internal.app) },
	];
</script>

<svelte:head>
	<!-- Every door names the one address, so three doors are one page to an index. -->
	<link rel="canonical" href={new URL('/', canonical).href} />
</svelte:head>

<div class="flex min-h-dvh flex-col bg-page text-text">
	<header class="border-b border-border">
		<nav
			class="mx-auto flex h-14 max-w-180 items-center justify-between gap-4 px-6"
			aria-label="Platform"
		>
			<a
				href={resolve('/')}
				class="focus-ring font-mono text-sm font-semibold tracking-tight text-text-strong"
			>
				status
			</a>
			<div class="flex items-center gap-1 text-sm">
				{#each platform as link (link.href)}
					<a
						href={link.href}
						class="focus-ring rounded-full px-2.5 py-1 text-text-muted transition-colors hover:bg-paper-hover hover:text-text-strong"
					>
						{link.label}
					</a>
				{/each}
				<ThemeToggle />
			</div>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-180 flex-1 px-6 pt-10 pb-16 sm:pt-16">
		{@render children()}
	</main>

	<footer class="border-t border-border">
		<div class="mx-auto max-w-180 px-6 py-6 text-sm text-text-soft">
			<p>
				This page is <a
					class="focus-ring text-text-muted underline underline-offset-4"
					href={canonical}
				>
					{host(canonical)}</a
				>. When that name does not resolve, the same page is at
				<a class="focus-ring text-text-muted underline underline-offset-4" href={mirror}
					>{host(mirror)}</a
				>.
			</p>
		</div>
	</footer>
</div>

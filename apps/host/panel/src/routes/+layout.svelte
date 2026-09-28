<script lang="ts">
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { api, SignedOut } from '$lib/api';
	import Login from '$lib/login.svelte';
	import { arrive } from '$lib/motion';
	import { session } from '$lib/session.svelte';
	import Sidebar from '$lib/sidebar.svelte';
	import '../panel.css';

	let { children }: { children: Snippet } = $props();

	/**
	 * The visual layer in development, linked as the site and the editor link it: the layer order
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

	/** The machine's own name for itself, once the meter has said it. */
	let machine: string | undefined = $state();

	$effect(() => {
		api
			.apps()
			.then(() => (session.signedIn = true))
			.catch((error) => (session.signedIn = !(error instanceof SignedOut)));
	});

	$effect(() => {
		if (!session.signedIn) return;
		api
			.now()
			.then((now) => (machine = now.info.model ?? undefined))
			.catch(() => undefined);
	});

	async function signOut() {
		await api.signOut().catch(() => undefined);
		session.signedIn = false;
	}
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. -->
	{#if dev}{@html DEV_STYLEX}{/if}
</svelte:head>

{#if session.signedIn === false}
	<Login onsignedin={() => (session.signedIn = true)} />
{:else if session.signedIn}
	<div class="flex min-h-screen">
		<Sidebar {machine} onsignout={signOut} />
		<main class="min-w-0 flex-1">
			{#key page.url.pathname}
				<div class="mx-auto w-full max-w-[90rem] px-8 py-7" use:arrive>
					{@render children()}
				</div>
			{/key}
		</main>
	</div>
{/if}

<script lang="ts">
	import { dev } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { api } from '$lib/api';
	import Login from '$lib/login.svelte';
	import { arrive } from '$lib/motion';
	import { session } from '$lib/session.svelte';
	import Sidebar from '$lib/sidebar.svelte';
	import '../panel.css';

	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

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

	/**
	 * Signed in as the server found it, until this browser learns otherwise: a request refused
	 * since, a sign-in, a sign-out. `session` is only ever changed here, in the browser.
	 */
	const signedIn = $derived(session.signedIn ?? data.signedIn);

	async function signIn() {
		session.signedIn = true;
		await invalidateAll();
	}

	async function signOut() {
		await api.signOut().catch(() => undefined);
		session.signedIn = false;
	}
</script>

<svelte:head>
	<!-- First in the head on purpose: it declares the order the layers below it take. -->
	{#if dev}{@html DEV_STYLEX}{/if}
</svelte:head>

{#if !signedIn}
	<Login onsignedin={signIn} />
{:else}
	<div class="flex min-h-screen">
		<Sidebar machine={data.machine} onsignout={signOut} />
		<main class="min-w-0 flex-1">
			{#key page.url.pathname}
				<div class="mx-auto w-full max-w-[90rem] px-8 py-7" use:arrive>
					{@render children()}
				</div>
			{/key}
		</main>
	</div>
{/if}

<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { api, SignedOut } from '$lib/api';
	import Login from '$lib/login.svelte';
	import { session } from '$lib/session.svelte';
	import '../panel.css';

	let { children }: { children: Snippet } = $props();

	$effect(() => {
		api
			.apps()
			.then(() => (session.signedIn = true))
			.catch((error) => (session.signedIn = !(error instanceof SignedOut)));
	});

	const onRoutes = $derived(page.url.pathname.startsWith('/routes'));

	async function signOut() {
		await api.signOut().catch(() => undefined);
		session.signedIn = false;
	}
</script>

{#if session.signedIn === false}
	<Login onsignedin={() => (session.signedIn = true)} />
{:else if session.signedIn}
	<header class="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
		<nav class="flex items-center gap-4">
			<strong>host</strong>
			<a href="/" class={onRoutes ? 'text-muted' : 'text-ink'}>Apps</a>
			<a href="/routes" class={onRoutes ? 'text-ink' : 'text-muted'}>Routes</a>
		</nav>
		<button onclick={signOut}>Sign out</button>
	</header>
	<main class="mx-auto max-w-5xl p-5">
		{@render children()}
	</main>
{/if}

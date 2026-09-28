<script lang="ts">
	import { api, SignedOut } from './lib/api';
	import AppPage from './lib/app-page.svelte';
	import Apps from './lib/apps.svelte';
	import Login from './lib/login.svelte';
	import Routes from './lib/routes.svelte';

	/** The page, from the hash, so no path of the panel's is ever one of the API's. */
	let hash = $state(location.hash);
	let signedIn = $state<boolean | undefined>(undefined);

	$effect(() => {
		const follow = () => (hash = location.hash);
		addEventListener('hashchange', follow);
		return () => removeEventListener('hashchange', follow);
	});

	$effect(() => {
		api
			.apps()
			.then(() => (signedIn = true))
			.catch((error) => (signedIn = !(error instanceof SignedOut)));
	});

	const page = $derived.by(() => {
		const [, first, second] = hash.replace(/^#/, '').split('/');
		if (first === 'apps' && second) return { kind: 'app' as const, name: second };
		if (first === 'routes') return { kind: 'routes' as const };
		return { kind: 'apps' as const };
	});

	/** A request that came back signed out anywhere below sends the panel to sign in. */
	function signedOut(error: unknown): boolean {
		if (error instanceof SignedOut) {
			signedIn = false;
			return true;
		}
		return false;
	}

	async function signOut() {
		await api.signOut().catch(() => undefined);
		signedIn = false;
	}
</script>

{#if signedIn === false}
	<Login onsignedin={() => (signedIn = true)} />
{:else if signedIn}
	<header class="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
		<nav class="flex items-center gap-4">
			<strong>host</strong>
			<a href="#/apps" class={page.kind === 'routes' ? 'text-muted' : 'text-ink'}>Apps</a>
			<a href="#/routes" class={page.kind === 'routes' ? 'text-ink' : 'text-muted'}>Routes</a>
		</nav>
		<button onclick={signOut}>Sign out</button>
	</header>
	<main class="mx-auto max-w-5xl p-5">
		{#if page.kind === 'app'}
			{#key page.name}
				<AppPage name={page.name} {signedOut} />
			{/key}
		{:else if page.kind === 'routes'}
			<Routes {signedOut} />
		{:else}
			<Apps {signedOut} />
		{/if}
	</main>
{/if}

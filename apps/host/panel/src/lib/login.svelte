<script lang="ts">
	import { api, Refused } from './api';
	import { primary } from './ui';

	let { onsignedin }: { onsignedin: () => void } = $props();
	let token = $state('');
	let error = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		try {
			await api.signIn(token);
			token = '';
			onsignedin();
		} catch (failure) {
			error = failure instanceof Refused ? failure.message : 'host did not answer';
		}
	}
</script>

<form
	onsubmit={submit}
	class="mx-auto mt-[18vh] grid max-w-sm gap-3 rounded-xl border border-line bg-surface p-6"
>
	<h1 class="text-xl font-semibold">host</h1>
	<p class="text-muted">The token from host's .env, asked for once and kept by this browser.</p>
	<input
		type="password"
		autocomplete="current-password"
		bind:value={token}
		placeholder="Token"
		required
	/>
	<button class={primary} type="submit">Sign in</button>
	{#if error}<p class="text-danger">{error}</p>{/if}
</form>

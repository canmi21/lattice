<script lang="ts">
	/** The one question the panel asks before anything else: the token. */
	import * as stylex from '@stylexjs/stylex';
	import Server from '@lucide/svelte/icons/server';
	import { api, Refused } from './api';
	import Button from './button.svelte';
	import { arrive } from './motion';
	import { surfaces, tone, type } from './style/surfaces';
	import { radius } from './style/vocabulary.stylex';

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

	const styles = stylex.create({
		mark: {
			backgroundColor: 'var(--color-primary)',
			color: 'var(--nord6)',
			borderRadius: radius.lg,
		},
	});
</script>

<div class="flex min-h-screen items-center justify-center p-6">
	<form
		onsubmit={submit}
		use:arrive
		class="flex w-full max-w-sm flex-col gap-4 p-7 {stylex.attrs(surfaces.card).class}"
	>
		<span class="flex size-10 items-center justify-center {stylex.attrs(styles.mark).class}">
			<Server size={20} strokeWidth={2} />
		</span>
		<div class="flex flex-col gap-1">
			<h1 class={stylex.attrs(type.title).class}>Sign in to host</h1>
			<p class={stylex.attrs(type.muted).class}>
				The token from host's .env, asked for once and kept by this browser.
			</p>
		</div>
		<input
			type="password"
			autocomplete="current-password"
			bind:value={token}
			placeholder="Token"
			required
		/>
		<Button variant="primary" type="submit" class="h-9">Sign in</Button>
		{#if error}<p class={stylex.attrs(tone.danger).class}>{error}</p>{/if}
	</form>
</div>

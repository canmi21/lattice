<script lang="ts">
	import { api, Refused, short, when, type App } from './api';
	import Confirm from './confirm.svelte';
	import Environment from './environment.svelte';
	import History from './history.svelte';
	import Logs from './logs.svelte';
	import Status from './status.svelte';
	import { card, danger, row } from './ui';

	let { name, signedOut }: { name: string; signedOut: (error: unknown) => boolean } = $props();

	let app = $state<App | undefined>();
	let error = $state('');
	let busy = $state(false);
	let tab = $state<'history' | 'logs' | 'environment'>('history');
	/** Bumped after an action, so the tabs read again. */
	let changed = $state(0);

	interface Pending {
		title: string;
		detail: string;
		confirm: string;
		danger: boolean;
		run: () => Promise<unknown>;
	}
	let pending = $state<Pending | undefined>();

	async function load() {
		try {
			app = await api.app(name);
		} catch (failure) {
			if (!signedOut(failure))
				error = failure instanceof Refused ? failure.message : String(failure);
		}
	}

	$effect(() => {
		load();
	});

	/** host does none of these to itself; see spec/architecture/host.md. */
	const itself = $derived(name === 'host');

	function ask(request: Pending) {
		pending = request;
	}

	async function perform() {
		const request = pending;
		pending = undefined;
		if (!request) return;
		busy = true;
		error = '';
		try {
			await request.run();
		} catch (failure) {
			if (!signedOut(failure))
				error = failure instanceof Refused ? failure.message : String(failure);
		}
		busy = false;
		changed += 1;
		await load();
	}
</script>

{#if app}
	<section class={card}>
		<div class="flex items-center justify-between">
			<h2 class="text-base font-semibold">{app.manifest.name}</h2>
			<Status {app} />
		</div>
		<table class="mt-3 [&_th]:w-32">
			<tbody>
				<tr
					><th>Version</th><td
						><code>{short(app.image)}</code>
						<span class="text-muted">since {when(app.deployed_at)}</span></td
					></tr
				>
				<tr><th>Previous</th><td><code>{short(app.previous?.image) || 'none'}</code></td></tr>
				<tr><th>Port</th><td>{app.manifest.container?.port ?? ''}</td></tr>
			</tbody>
		</table>
		<div class="{row} mt-4">
			<button
				disabled={busy || itself}
				onclick={() =>
					ask({
						title: `Redeploy ${name}`,
						detail:
							'Runs the current version again, picking up a changed environment. A failed check puts it back as it was.',
						confirm: 'Redeploy',
						danger: false,
						run: () => api.redeploy(name),
					})}>Redeploy</button
			>
			<button
				disabled={busy || itself || !app.previous}
				onclick={() =>
					ask({
						title: `Roll back ${name}`,
						detail: `Runs the previous version, ${short(app?.previous?.image)}, keeping the data and the environment as they are now.`,
						confirm: 'Roll back',
						danger: false,
						run: () => api.rollback(name, false),
					})}>Roll back</button
			>
			<button
				class={danger}
				disabled={busy || itself || !app.previous || !app.restorable}
				title={app.restorable ? '' : 'The snapshot from before this version is no longer kept'}
				onclick={() =>
					ask({
						title: `Roll back ${name} with its data`,
						detail: `Runs the previous version and restores the data and the environment to how they were before the current version was deployed. Everything written since is lost.`,
						confirm: 'Roll back with data',
						danger: true,
						run: () => api.rollback(name, true),
					})}>Roll back with data</button
			>
			<span class="flex-1"></span>
			<button
				disabled={busy || itself}
				onclick={() =>
					ask({
						title: `Start ${name}`,
						detail: 'Starts the container as it is, and ends a hold.',
						confirm: 'Start',
						danger: false,
						run: () => api.act(name, 'start'),
					})}>Start</button
			>
			<button
				disabled={busy || itself}
				onclick={() =>
					ask({
						title: `Restart ${name}`,
						detail: 'Restarts the container as it is.',
						confirm: 'Restart',
						danger: false,
						run: () => api.act(name, 'restart'),
					})}>Restart</button
			>
			<button
				class={danger}
				disabled={busy || itself}
				onclick={() =>
					ask({
						title: `Stop ${name}`,
						detail:
							'Stops the container and holds it stopped: through a reboot and through deploys, until it is started here.',
						confirm: 'Stop',
						danger: true,
						run: () => api.act(name, 'stop'),
					})}>Stop</button
			>
		</div>
		{#if itself}<p class="mt-3 text-muted">host does not act on itself; keeper replaces it.</p>{/if}
		{#if busy}<p class="mt-3 text-muted">Working…</p>{/if}
		{#if error}<p class="mt-3 text-danger">{error}</p>{/if}
	</section>

	<nav class="{row} mb-3">
		<button
			class={tab === 'history' ? 'border-accent text-accent' : ''}
			onclick={() => (tab = 'history')}>History</button
		>
		<button class={tab === 'logs' ? 'border-accent text-accent' : ''} onclick={() => (tab = 'logs')}
			>Logs</button
		>
		<button
			class={tab === 'environment' ? 'border-accent text-accent' : ''}
			onclick={() => (tab = 'environment')}>Environment</button
		>
	</nav>

	{#key changed}
		{#if tab === 'history'}
			<History {name} {signedOut} />
		{:else if tab === 'logs'}
			<Logs {name} {signedOut} />
		{:else}
			<Environment
				{name}
				{signedOut}
				onredeploy={() =>
					ask({
						title: `Redeploy ${name}`,
						detail: 'Runs the current version again with the environment as it now is.',
						confirm: 'Redeploy',
						danger: false,
						run: () => api.redeploy(name),
					})}
			/>
		{/if}
	{/key}
{:else if error}
	<p class="text-danger">{error}</p>
{/if}

{#if pending}
	<Confirm
		title={pending.title}
		detail={pending.detail}
		confirm={pending.confirm}
		danger={pending.danger}
		onconfirm={perform}
		oncancel={() => (pending = undefined)}
	/>
{/if}

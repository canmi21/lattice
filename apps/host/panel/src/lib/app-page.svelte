<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import DatabaseBackup from '@lucide/svelte/icons/database-backup';
	import Play from '@lucide/svelte/icons/play';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Square from '@lucide/svelte/icons/square';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { signedOut } from './session.svelte';
	import { api, Refused, short, when, type App } from './api';
	import Button from './button.svelte';
	import Confirm from './confirm.svelte';
	import Environment from './environment.svelte';
	import { ago } from './format';
	import History from './history.svelte';
	import Logs from './logs.svelte';
	import PageHeader from './page-header.svelte';
	import Status from './status.svelte';
	import { surfaces, tone, type } from './style/surfaces';
	import Tabs from './tabs.svelte';

	let { name }: { name: string } = $props();

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

	const facts = $derived(
		app
			? [
					{
						label: 'Version',
						value: short(app.image),
						detail: `since ${ago(app.deployed_at)}`,
						mono: true,
					},
					{
						label: 'Previous',
						value: short(app.previous?.image) || 'None',
						detail: app.restorable ? 'Its data is still kept' : 'Its data is no longer kept',
						mono: !!app.previous,
					},
					{
						label: 'Answers on',
						value: String(app.manifest.container?.port ?? app.manifest.container?.socket ?? '–'),
						detail: app.manifest.container?.port
							? 'Its port, on its own network'
							: 'A socket, with no network',
						mono: true,
					},
					{
						label: 'Memory',
						value: `${app.manifest.container?.memory_mb ?? 512} MiB`,
						detail: 'Its ceiling, with no swap past it',
						mono: false,
					},
				]
			: [],
	);
</script>

{#if app}
	<PageHeader
		title={app.manifest.name}
		description="Deployed {when(app.deployed_at)}"
		back={{ href: '/apps', label: 'Apps' }}
	>
		{#snippet meta()}{#if app}<Status {app} />{/if}{/snippet}
		{#snippet actions()}
			{#if app}
				<Button
					icon={RotateCcw}
					disabled={busy || itself}
					onclick={() =>
						ask({
							title: `Redeploy ${name}`,
							detail:
								'Runs the current version again, picking up a changed environment. A failed check puts it back as it was.',
							confirm: 'Redeploy',
							danger: false,
							run: () => api.redeploy(name),
						})}>Redeploy</Button
				>
				<Button
					icon={Undo2}
					disabled={busy || itself || !app.previous}
					onclick={() =>
						ask({
							title: `Roll back ${name}`,
							detail: `Runs the previous version, ${short(app?.previous?.image)}, keeping the data and the environment as they are now.`,
							confirm: 'Roll back',
							danger: false,
							run: () => api.rollback(name, false),
						})}>Roll back</Button
				>
				<Button
					variant="danger"
					icon={DatabaseBackup}
					disabled={busy || itself || !app.previous || !app.restorable}
					title={app.restorable ? '' : 'The snapshot from before this version is no longer kept'}
					onclick={() =>
						ask({
							title: `Roll back ${name} with its data`,
							detail: `Runs the previous version and restores the data and the environment to how they were before the current version was deployed. Everything written since is lost.`,
							confirm: 'Roll back with data',
							danger: true,
							run: () => api.rollback(name, true),
						})}>Roll back with data</Button
				>
				<span class="mx-1 h-5 w-px {stylex.attrs(surfaces.divider).class}"></span>
				<Button
					variant="ghost"
					icon={Play}
					disabled={busy || itself}
					onclick={() =>
						ask({
							title: `Start ${name}`,
							detail: 'Starts the container as it is, and ends a hold.',
							confirm: 'Start',
							danger: false,
							run: () => api.act(name, 'start'),
						})}>Start</Button
				>
				<Button
					variant="ghost"
					icon={RefreshCw}
					disabled={busy || itself}
					onclick={() =>
						ask({
							title: `Restart ${name}`,
							detail: 'Restarts the container as it is.',
							confirm: 'Restart',
							danger: false,
							run: () => api.act(name, 'restart'),
						})}>Restart</Button
				>
				<Button
					variant="danger"
					icon={Square}
					disabled={busy || itself}
					onclick={() =>
						ask({
							title: `Stop ${name}`,
							detail:
								'Stops the container and holds it stopped: through a reboot and through deploys, until it is started here.',
							confirm: 'Stop',
							danger: true,
							run: () => api.act(name, 'stop'),
						})}>Stop</Button
				>
			{/if}
		{/snippet}
	</PageHeader>

	{#if itself || busy || error}
		<p class="-mt-2 mb-5 {stylex.attrs(type.muted, error ? tone.danger : null).class}">
			{error || (busy ? 'Working…' : 'host does not act on itself; keeper replaces it.')}
		</p>
	{/if}

	<div class="mb-7 grid grid-cols-4 gap-4">
		{#each facts as fact (fact.label)}
			<div class="flex min-w-0 flex-col gap-1.5 px-5 py-4 {stylex.attrs(surfaces.card).class}">
				<span class={stylex.attrs(type.label).class}>{fact.label}</span>
				<span class="truncate {stylex.attrs(type.heading, fact.mono && type.monoFace).class}"
					>{fact.value}</span
				>
				<span class="truncate {stylex.attrs(type.muted).class}">{fact.detail}</span>
			</div>
		{/each}
	</div>

	<Tabs
		bind:current={tab}
		tabs={[
			{ key: 'history', label: 'History' },
			{ key: 'logs', label: 'Logs' },
			{ key: 'environment', label: 'Environment' },
		]}
	/>

	{#key changed}
		{#if tab === 'history'}
			<History {name} />
		{:else if tab === 'logs'}
			<Logs {name} />
		{:else}
			<Environment
				{name}
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
	<p class={stylex.attrs(tone.danger).class}>{error}</p>
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

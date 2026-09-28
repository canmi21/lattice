<script lang="ts">
	/** Every app this node runs, and what it ran before. */
	import { goto } from '$app/navigation';
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import Box from '@lucide/svelte/icons/box';
	import { api, short, when, type App } from './api';
	import Card from './card.svelte';
	import { ago } from './format';
	import PageHeader from './page-header.svelte';
	import { signedOut } from './session.svelte';
	import Status from './status.svelte';
	import { surfaces, tone, type } from './style/surfaces';

	let { initial }: { initial?: App[] } = $props();

	// What the server read is where the page starts; without it, the browser asks.
	let apps = $state<App[]>(untrack(() => initial ?? []));
	let loaded = $state(untrack(() => initial !== undefined));
	let error = $state('');

	$effect(() => {
		if (untrack(() => initial) !== undefined) return;
		api
			.apps()
			.then((all) => (apps = all))
			.catch((failure) => {
				if (!signedOut(failure)) error = String(failure);
			})
			.finally(() => (loaded = true));
	});

	const counts = $derived([
		{ label: 'Apps', value: apps.length, tone: undefined },
		{ label: 'Running', value: apps.filter((app) => app.running).length, tone: tone.good },
		{
			label: 'Stopped',
			value: apps.filter((app) => !app.running && !app.held).length,
			tone: tone.danger,
		},
		{ label: 'Held', value: apps.filter((app) => app.held).length, tone: tone.warn },
	]);

	/** What a container may use, as its declaration says or host's default. */
	function memory(app: App): string {
		return `${app.manifest.container?.memory_mb ?? 512} MiB`;
	}
</script>

<PageHeader title="Apps" description="Everything this node runs, one container each" />

<div class="mb-6 grid grid-cols-4 gap-4">
	{#each counts as count (count.label)}
		<div class="flex flex-col gap-2 px-5 py-4 {stylex.attrs(surfaces.card).class}">
			<span class={stylex.attrs(type.label).class}>{count.label}</span>
			<span class={stylex.attrs(type.figure, count.tone).class}>{loaded ? count.value : '–'}</span>
		</div>
	{/each}
</div>

{#if error}<p class="mb-4 {stylex.attrs(tone.danger).class}">{error}</p>{/if}

<Card flush>
	<table>
		<thead>
			<tr
				><th>App</th><th>Status</th><th>Version</th><th>Previous</th><th>Memory</th><th>Deployed</th
				></tr
			>
		</thead>
		<tbody>
			{#each apps as app (app.manifest.name)}
				<tr class="cursor-pointer" onclick={() => goto(`/apps/${app.manifest.name}`)}>
					<td>
						<a
							href="/apps/{app.manifest.name}"
							class="inline-flex items-center gap-2.5 {stylex.attrs(type.heading).class}"
						>
							<span class={stylex.attrs(tone.accent).class}
								><Box size={15} strokeWidth={1.75} /></span
							>
							{app.manifest.name}
						</a>
					</td>
					<td><Status {app} /></td>
					<td><code class={stylex.attrs(type.mono).class}>{short(app.image)}</code></td>
					<td
						><code class={stylex.attrs(type.mono, tone.muted).class}
							>{short(app.previous?.image) || '–'}</code
						></td
					>
					<td class={stylex.attrs(tone.muted).class}>{memory(app)}</td>
					<td class={stylex.attrs(tone.muted).class} title={when(app.deployed_at)}
						>{ago(app.deployed_at)}</td
					>
				</tr>
			{:else}
				<tr
					><td colspan="6" class={stylex.attrs(tone.muted).class}
						>{loaded ? 'Nothing deployed yet' : 'Loading…'}</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</Card>

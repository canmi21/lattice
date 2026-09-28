<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import Globe from '@lucide/svelte/icons/globe';
	import Lock from '@lucide/svelte/icons/lock';
	import { signedOut } from './session.svelte';
	import { api, Refused, type Route } from './api';
	import Badge from './badge.svelte';
	import Button from './button.svelte';
	import Card from './card.svelte';
	import PageHeader from './page-header.svelte';
	import { tone, type } from './style/surfaces';

	const blank = (): Route => ({ name: '', upstream: '', private: true, public: false, home: '' });
	let { initial }: { initial?: Route[] } = $props();

	// What the server read is where the page starts; the browser reads again after every change.
	let routes = $state<Route[]>(untrack(() => initial ?? []));
	let editing = $state<Route>(blank());
	let error = $state('');

	async function load() {
		try {
			routes = await api.routes();
		} catch (failure) {
			if (!signedOut(failure)) error = String(failure);
		}
	}

	$effect(() => {
		if (untrack(() => initial) === undefined) load();
	});

	async function attempt(run: () => Promise<unknown>) {
		error = '';
		try {
			await run();
			editing = blank();
		} catch (failure) {
			if (!signedOut(failure))
				error = failure instanceof Refused ? failure.message : String(failure);
		}
		await load();
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		const route = { ...editing, home: editing.home || undefined };
		attempt(() => api.putRoute(route));
	}

	function remove(name: string) {
		if (confirm(`Remove the route ${name}?`)) attempt(() => api.deleteRoute(name));
	}
</script>

<PageHeader
	title="Routes"
	description="Names that reach something host does not run: a device on the LAN, or a container of another project"
/>

{#if error}<p class="mb-4 {stylex.attrs(tone.danger).class}">{error}</p>{/if}

<div class="flex flex-col gap-6">
	<Card flush>
		<table>
			<thead>
				<tr><th>Name</th><th>Upstream</th><th>Reached</th><th>Home</th><th></th></tr>
			</thead>
			<tbody>
				{#each routes as route (route.name)}
					<tr>
						<td class={stylex.attrs(type.heading).class}>{route.name}</td>
						<td><code class={stylex.attrs(type.mono).class}>{route.upstream}</code></td>
						<td>
							<div class="flex gap-1.5">
								{#if route.private}<Badge tone="muted">Private</Badge>{/if}
								{#if route.public}<Badge tone="good">Public</Badge>{/if}
							</div>
						</td>
						<td
							><code class={stylex.attrs(type.mono, tone.muted).class}>{route.home ?? '–'}</code
							></td
						>
						<td class="w-44">
							<div class="flex justify-end gap-2">
								<Button
									variant="ghost"
									onclick={() => (editing = { ...route, home: route.home ?? '' })}>Edit</Button
								>
								<Button variant="danger" onclick={() => remove(route.name)}>Remove</Button>
							</div>
						</td>
					</tr>
				{:else}
					<tr><td colspan="5" class={stylex.attrs(type.muted).class}>No routes yet</td></tr>
				{/each}
			</tbody>
		</table>
	</Card>

	<Card
		title={routes.some((route) => route.name === editing.name)
			? `Edit ${editing.name}`
			: 'Add a route'}
	>
		<form class="flex flex-wrap items-center gap-3" onsubmit={save}>
			<input
				class="w-40"
				bind:value={editing.name}
				placeholder="name"
				pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
				required
			/>
			<input
				class="min-w-72 flex-1"
				bind:value={editing.upstream}
				placeholder="host:port, or https prefixed for a TLS-only device"
				required
			/>
			<input class="w-44" bind:value={editing.home} placeholder="Home, such as /admin" />
			<label class="inline-flex items-center gap-1.5 {stylex.attrs(type.muted).class}">
				<input type="checkbox" bind:checked={editing.private} /><Lock size={13} /> Private
			</label>
			<label class="inline-flex items-center gap-1.5 {stylex.attrs(type.muted).class}">
				<input type="checkbox" bind:checked={editing.public} /><Globe size={13} /> Public
			</label>
			<Button variant="primary" type="submit">Save</Button>
		</form>
	</Card>
</div>

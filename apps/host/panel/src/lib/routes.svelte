<script lang="ts">
	import { api, Refused, type Route } from './api';
	import { card, danger, heading, primary, row } from './ui';

	let { signedOut }: { signedOut: (error: unknown) => boolean } = $props();

	const blank = (): Route => ({ name: '', upstream: '', private: true, public: false, home: '' });
	let routes = $state<Route[]>([]);
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
		load();
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

<section class={card}>
	<h2 class={heading}>Routes</h2>
	<p class="mb-2 text-muted">
		Names that reach something host does not run: a device on the LAN, or a container of another
		project.
	</p>
	{#if error}<p class="text-danger">{error}</p>{/if}
	<table>
		<thead>
			<tr><th>Name</th><th>Upstream</th><th>Private</th><th>Public</th><th>Home</th><th></th></tr>
		</thead>
		<tbody>
			{#each routes as route (route.name)}
				<tr>
					<td>{route.name}</td>
					<td><code>{route.upstream}</code></td>
					<td>{route.private ? 'yes' : ''}</td>
					<td>{route.public ? 'yes' : ''}</td>
					<td><code>{route.home ?? ''}</code></td>
					<td class={row}>
						<button onclick={() => (editing = { ...route, home: route.home ?? '' })}>Edit</button>
						<button class={danger} onclick={() => remove(route.name)}>Remove</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<section class={card}>
	<h2 class={heading}>
		{routes.some((route) => route.name === editing.name) ? `Edit ${editing.name}` : 'Add a route'}
	</h2>
	<form class={row} onsubmit={save}>
		<input
			bind:value={editing.name}
			placeholder="name"
			pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
			required
		/>
		<input bind:value={editing.upstream} placeholder="host:port, or https prefixed for a TLS-only device" required />
		<label class={row}><input type="checkbox" bind:checked={editing.private} /> Private</label>
		<label class={row}><input type="checkbox" bind:checked={editing.public} /> Public</label>
		<input bind:value={editing.home} placeholder="home, such as /admin" />
		<button class={primary} type="submit">Save</button>
	</form>
</section>

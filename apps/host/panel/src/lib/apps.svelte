<script lang="ts">
	import { signedOut } from './session.svelte';
	import { api, short, when, type App } from './api';
	import Status from './status.svelte';
	import { card, heading } from './ui';

	let apps = $state<App[]>([]);
	let error = $state('');

	$effect(() => {
		api
			.apps()
			.then((all) => (apps = all))
			.catch((failure) => {
				if (!signedOut(failure)) error = String(failure);
			});
	});
</script>

<section class={card}>
	<h2 class={heading}>Apps</h2>
	{#if error}<p class="text-danger">{error}</p>{/if}
	<table>
		<thead>
			<tr><th>Name</th><th>Status</th><th>Version</th><th>Previous</th><th>Deployed</th></tr>
		</thead>
		<tbody>
			{#each apps as app (app.manifest.name)}
				<tr>
					<td><a class="text-accent" href="/apps/{app.manifest.name}">{app.manifest.name}</a></td>
					<td><Status {app} /></td>
					<td><code>{short(app.image)}</code></td>
					<td><code class="text-muted">{short(app.previous?.image)}</code></td>
					<td class="text-muted">{when(app.deployed_at)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<script lang="ts">
	import { api, Refused, type Environment } from './api';
	import { card, danger, heading, primary, row } from './ui';

	let {
		name,
		signedOut,
		onredeploy,
	}: { name: string; signedOut: (error: unknown) => boolean; onredeploy: () => void } = $props();

	let environment = $state<Environment>({ config: {}, secrets: [] });
	/** Something changed that the running container does not have yet. */
	let unapplied = $state(false);
	let error = $state('');
	let edits = $state<Record<string, string>>({});
	let adding = $state({ kind: 'config' as 'config' | 'secret', key: '', value: '' });

	async function load() {
		try {
			environment = await api.environment(name);
			edits = { ...environment.config };
		} catch (failure) {
			if (!signedOut(failure)) error = String(failure);
		}
	}

	$effect(() => {
		load();
	});

	async function change(run: () => Promise<{ changed: boolean }>) {
		error = '';
		try {
			if ((await run()).changed) unapplied = true;
		} catch (failure) {
			if (!signedOut(failure))
				error = failure instanceof Refused ? failure.message : String(failure);
		}
		await load();
	}

	function add(event: SubmitEvent) {
		event.preventDefault();
		const { kind, key, value } = adding;
		change(() => api.setVariable(name, kind, key, value)).then(() => {
			adding = { kind, key: '', value: '' };
		});
	}

	function remove(kind: 'config' | 'secret', key: string) {
		if (confirm(`Remove ${key}?`)) change(() => api.unsetVariable(name, kind, key));
	}
</script>

{#if unapplied}
	<section class="{card} {row} justify-between border-accent">
		<span
			>Changed. The running container has the environment it started with; a redeploy applies this.</span
		>
		<button class={primary} onclick={onredeploy}>Redeploy</button>
	</section>
{/if}
{#if error}<p class="mb-3 text-danger">{error}</p>{/if}

<section class={card}>
	<h2 class={heading}>Configuration</h2>
	<table>
		<tbody>
			{#each Object.keys(environment.config) as key (key)}
				<tr>
					<td><code>{key}</code></td>
					<td class="w-full"><input class="w-full" bind:value={edits[key]} /></td>
					<td class={row}>
						<button
							disabled={edits[key] === environment.config[key]}
							onclick={() => change(() => api.setVariable(name, 'config', key, edits[key] ?? ''))}
							>Save</button
						>
						<button class={danger} onclick={() => remove('config', key)}>Remove</button>
					</td>
				</tr>
			{:else}
				<tr><td class="text-muted">None</td></tr>
			{/each}
		</tbody>
	</table>
</section>

<section class={card}>
	<h2 class={heading}>Secrets</h2>
	<p class="mb-2 text-muted">
		Their values are never shown here; read one over SSH, in the app's secret.env.
	</p>
	<table>
		<tbody>
			{#each environment.secrets as key (key)}
				<tr>
					<td><code>{key}</code></td>
					<td class="w-full"
						><input
							class="w-full"
							type="password"
							autocomplete="off"
							bind:value={edits[key]}
							placeholder="New value"
						/></td
					>
					<td class={row}>
						<button
							disabled={!edits[key]}
							onclick={() => change(() => api.setVariable(name, 'secret', key, edits[key] ?? ''))}
							>Replace</button
						>
						<button class={danger} onclick={() => remove('secret', key)}>Remove</button>
					</td>
				</tr>
			{:else}
				<tr><td class="text-muted">None</td></tr>
			{/each}
		</tbody>
	</table>
</section>

<section class={card}>
	<h2 class={heading}>Add a variable</h2>
	<form class={row} onsubmit={add}>
		<select bind:value={adding.kind}>
			<option value="config">Configuration</option>
			<option value="secret">Secret</option>
		</select>
		<input bind:value={adding.key} placeholder="NAME" pattern="[A-Z_][A-Z0-9_]*" required />
		<input
			type={adding.kind === 'secret' ? 'password' : 'text'}
			autocomplete="off"
			bind:value={adding.value}
			placeholder="Value"
		/>
		<button class={primary} type="submit">Add</button>
	</form>
</section>

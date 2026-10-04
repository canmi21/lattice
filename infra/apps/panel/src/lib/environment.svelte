<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { signedOut } from './session.svelte';
	import { api, Refused, type Environment } from './api';
	import Button from './button.svelte';
	import Card from './card.svelte';
	import { badges, tone, type } from './style/surfaces';

	let { name, onredeploy }: { name: string; onredeploy: () => void } = $props();

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

<div class="flex flex-col gap-6">
	{#if unapplied}
		<div
			class="flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-3 {stylex.attrs(
				badges.warn,
			).class}"
		>
			<span
				>Changed. The running container has the environment it started with; a redeploy applies
				this.</span
			>
			<Button variant="primary" onclick={onredeploy}>Redeploy</Button>
		</div>
	{/if}
	{#if error}<p class={stylex.attrs(tone.danger).class}>{error}</p>{/if}

	<Card title="Configuration" description="config.env: shown here in full" flush>
		<table>
			<tbody>
				{#each Object.keys(environment.config) as key (key)}
					<tr>
						<td class="w-56"><code class={stylex.attrs(type.mono).class}>{key}</code></td>
						<td><input class="w-full" bind:value={edits[key]} /></td>
						<td class="w-44">
							<div class="flex justify-end gap-2">
								<Button
									disabled={edits[key] === environment.config[key]}
									onclick={() =>
										change(() => api.setVariable(name, 'config', key, edits[key] ?? ''))}
									>Save</Button
								>
								<Button variant="danger" onclick={() => remove('config', key)}>Remove</Button>
							</div>
						</td>
					</tr>
				{:else}
					<tr><td class={stylex.attrs(type.muted).class}>None</td></tr>
				{/each}
			</tbody>
		</table>
	</Card>

	<Card
		title="Secrets"
		description="secret.env: never shown here; read one over SSH, in the app's own directory"
		flush
	>
		<table>
			<tbody>
				{#each environment.secrets as key (key)}
					<tr>
						<td class="w-56"><code class={stylex.attrs(type.mono).class}>{key}</code></td>
						<td>
							<input
								class="w-full"
								type="password"
								autocomplete="off"
								bind:value={edits[key]}
								placeholder="New value"
							/>
						</td>
						<td class="w-44">
							<div class="flex justify-end gap-2">
								<Button
									disabled={!edits[key]}
									onclick={() =>
										change(() => api.setVariable(name, 'secret', key, edits[key] ?? ''))}
									>Replace</Button
								>
								<Button variant="danger" onclick={() => remove('secret', key)}>Remove</Button>
							</div>
						</td>
					</tr>
				{:else}
					<tr><td class={stylex.attrs(type.muted).class}>None</td></tr>
				{/each}
			</tbody>
		</table>
	</Card>

	<Card title="Add a variable">
		<form class="flex flex-wrap items-center gap-2" onsubmit={add}>
			<select bind:value={adding.kind}>
				<option value="config">Configuration</option>
				<option value="secret">Secret</option>
			</select>
			<input bind:value={adding.key} placeholder="NAME" pattern="[A-Z_][A-Z0-9_]*" required />
			<input
				class="min-w-64 flex-1"
				type={adding.kind === 'secret' ? 'password' : 'text'}
				autocomplete="off"
				bind:value={adding.value}
				placeholder="Value"
			/>
			<Button variant="primary" type="submit">Add</Button>
		</form>
	</Card>
</div>

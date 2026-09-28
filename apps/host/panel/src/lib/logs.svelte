<script lang="ts">
	import { signedOut } from './session.svelte';
	import { api, type Archived } from './api';
	import { card, heading } from './ui';

	let { name }: { name: string } = $props();

	let lines = $state<string[]>([]);
	let archived = $state<Archived[]>([]);
	let error = $state('');

	async function load() {
		try {
			[lines, archived] = await Promise.all([
				api.lines(name).then((answer) => answer.lines),
				api.archived(name),
			]);
		} catch (failure) {
			if (!signedOut(failure)) error = String(failure);
		}
	}

	$effect(() => {
		load();
	});

	function size(bytes: number): string {
		return bytes < 1024 * 1024
			? `${Math.ceil(bytes / 1024)} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<section class={card}>
	<div class="flex items-center justify-between">
		<h2 class="text-base font-semibold">Running container</h2>
		<button onclick={load}>Refresh</button>
	</div>
	{#if error}<p class="text-danger">{error}</p>{/if}
	<pre class="mt-3 max-h-[60vh] overflow-auto break-all whitespace-pre-wrap">{lines.join('\n') ||
			'No lines'}</pre>
</section>

<section class={card}>
	<h2 class={heading}>Earlier versions</h2>
	<table>
		<tbody>
			{#each archived as log (log.file)}
				<tr>
					<td
						><a
							class="text-accent"
							href="/api/apps/{name}/logs/archive/{log.file}"
							target="_blank"
							rel="noopener">{log.file}</a
						></td
					>
					<td class="text-muted">{size(log.bytes)}</td>
				</tr>
			{:else}
				<tr><td class="text-muted">None archived yet</td></tr>
			{/each}
		</tbody>
	</table>
</section>

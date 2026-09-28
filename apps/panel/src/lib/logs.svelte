<script lang="ts">
	/** What the running container wrote, and the logs of every version before it. */
	import * as stylex from '@stylexjs/stylex';
	import FileText from '@lucide/svelte/icons/file-text';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { signedOut } from './session.svelte';
	import { api, type Archived } from './api';
	import Button from './button.svelte';
	import Card from './card.svelte';
	import { bytes } from './format';
	import { surfaces, tone, type } from './style/surfaces';

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
</script>

<div class="flex flex-col gap-6">
	<Card title="Running container" description="Its last lines, each with Docker's timestamp">
		{#snippet actions()}
			<Button variant="ghost" icon={RefreshCw} onclick={load}>Refresh</Button>
		{/snippet}
		{#if error}<p class="mb-3 {stylex.attrs(tone.danger).class}">{error}</p>{/if}
		<pre
			class="max-h-[60vh] overflow-auto p-4 break-all whitespace-pre-wrap {stylex.attrs(
				surfaces.well,
			).class}">{lines.join('\n') || 'No lines'}</pre>
	</Card>

	<Card
		title="Earlier versions"
		description="Archived as each container was replaced, and kept"
		flush
	>
		<table>
			<tbody>
				{#each archived as log (log.file)}
					<tr>
						<td>
							<a
								class="inline-flex items-center gap-2 {stylex.attrs(tone.accent).class}"
								href="/api/apps/{name}/logs/archive/{log.file}"
								target="_blank"
								rel="noopener"><FileText size={14} strokeWidth={1.75} />{log.file}</a
							>
						</td>
						<td class="text-right {stylex.attrs(tone.muted).class}">{bytes(log.bytes)}</td>
					</tr>
				{:else}
					<tr><td class={stylex.attrs(type.muted).class}>None archived yet</td></tr>
				{/each}
			</tbody>
		</table>
	</Card>
</div>

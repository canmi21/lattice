<script lang="ts">
	/** Whether an app is up, and whether it is held down. */
	import type { App } from './api';
	import Badge from './badge.svelte';

	let { app }: { app: App } = $props();
</script>

{#if app.held}
	<Badge tone="warn">Held stopped</Badge>
{:else if app.running}
	<Badge tone="good">Running</Badge>
{:else}
	<Badge tone="danger">Stopped</Badge>
{/if}

<script lang="ts">
	import type { App } from './api';

	let { app }: { app: App } = $props();
	const pill = 'inline-block rounded-full border border-current px-2 text-xs';
</script>

{#if app.held}
	<span class="{pill} text-warn">held stopped</span>
{:else if app.running}
	<span class="{pill} text-good">running</span>
{:else}
	<span class="{pill} text-danger">stopped</span>
{/if}

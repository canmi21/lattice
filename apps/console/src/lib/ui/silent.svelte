<script lang="ts">
	/** The nodes a page's reads did not reach, in one line; each one's reason on hover. */
	import * as stylex from '@stylexjs/stylex';
	import WarningIcon from '@tabler/icons-svelte-runes/icons/alert-triangle';
	import NodeName from '../nodes/node-name.svelte';
	import { tone, type } from '../style.ts';

	let { nodes }: { nodes: { node: string; message?: string }[] } = $props();
</script>

{#if nodes.length}
	<p class="flex items-center gap-2 {stylex.attrs(type.soft).class}" role="status">
		<span class="inline-flex shrink-0 {stylex.attrs(tone.warn).class}"
			><WarningIcon size={14} stroke={2.5} /></span
		>
		<span
			>Not answering: {#each nodes as one, index (one.node)}{index ? ', ' : ''}<span
					title={one.message}><NodeName code={one.node} /></span
				>{/each}</span
		>
	</p>
{/if}

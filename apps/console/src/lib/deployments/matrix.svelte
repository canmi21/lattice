<script lang="ts">
	/**
	 * A run's apps down, every node across: each cell where that app got to on that node, its
	 * stage while it deploys and where it failed when it did, the reason on hover, the node a click
	 * away. A node that placed the app nowhere says so; one that did not answer is unknown.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { scoped } from '../scope/context.ts';
	import type { Node } from '../server/nodes.ts';
	import { type } from '../style.ts';
	import Badge from '../ui/badge.svelte';
	import { said, TONE, type Cell } from './state.ts';

	let { rows, nodes }: { rows: Cell[][]; nodes: Node[] } = $props();

	const { node: toNode } = scoped();

	const hint = (cell: Cell) =>
		cell.placement?.detail ??
		(cell.mark === 'unknown' ? `${cell.node} did not answer` : `${cell.app} on ${cell.node}`);
	const styles = stylex.create({ none: { color: 'var(--color-text-faint)' } });
</script>

<table>
	<caption class="sr-only">Each app of the run on each node</caption>
	<thead>
		<tr>
			<th scope="col">App</th>
			{#each nodes as node (node)}<th scope="col">{node}</th>{/each}
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row[0]?.app)}
			<tr>
				<td class={stylex.attrs(type.mono).class}>{row[0]?.app}</td>
				{#each row as cell (cell.node)}
					<td class="px-3">
						{#if cell.mark === 'absent'}
							<span class={stylex.attrs(type.soft, styles.none).class}>Not placed</span>
						{:else}
							<a href={toNode(cell.node)} title={hint(cell)}>
								<Badge tone={TONE[cell.mark]}>{said(cell.mark, cell.placement?.stage)}</Badge>
							</a>
						{/if}
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

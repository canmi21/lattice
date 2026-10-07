<script lang="ts">
	/**
	 * A chart's container: its legend, the switch to a table of the same values, and what is said
	 * in the chart's place when there is nothing to draw or the read failed. The body holds the
	 * chart's height in every one of those, and the row above it is always there, so nothing
	 * below it moves.
	 */
	import * as stylex from '@stylexjs/stylex';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import Table from '@lucide/svelte/icons/table-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { Snippet } from 'svelte';
	import { surfaces, tone, type } from '../style.ts';
	import Legend from './legend.svelte';
	import type { Key, Tabular } from './series.ts';
	import { chart } from './style.ts';

	let {
		label,
		height,
		legend = [],
		mark = 'line',
		hidden = $bindable([]),
		table,
		empty = false,
		emptyText = 'Nothing to show',
		error,
		stale = false,
		children,
	}: {
		/** What the chart shows, for a reader who does not see it, and the table's caption. */
		label: string;
		/** The body's height in pixels, axes included. */
		height: number;
		legend?: Key[];
		mark?: 'line' | 'rect';
		hidden?: string[];
		table: Tabular;
		empty?: boolean;
		emptyText?: string;
		/** Why the data could not be read; said in place of the chart. */
		error?: string;
		/** A newer read is on its way: the drawing stays, dimmed. */
		stale?: boolean;
		children: Snippet;
	} = $props();

	let tabular = $state(false);

	const styles = stylex.create({
		switch: {
			backgroundColor: 'transparent',
			borderWidth: 0,
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
		},
	});
</script>

<figure class="m-0 flex min-w-0 flex-col gap-2" aria-busy={stale} aria-label={label}>
	<div class="flex min-h-6 items-start justify-between gap-3">
		{#if legend.length >= 2}<Legend items={legend} {mark} bind:hidden />{:else}<span></span>{/if}
		{#if !(empty || error)}
			<button
				type="button"
				aria-pressed={tabular}
				class="inline-flex h-6 shrink-0 items-center gap-1.5 px-1 {stylex.attrs(
					type.soft,
					styles.switch,
				).class}"
				onclick={() => (tabular = !tabular)}
			>
				{#if tabular}<ChartLine size={14} strokeWidth={1.75} />Chart{:else}<Table
						size={14}
						strokeWidth={1.75}
					/>Table{/if}
			</button>
		{/if}
	</div>
	<div class="relative" style:height="{height}px">
		{#if error}
			<div
				class="flex h-full flex-col items-center justify-center gap-1 px-4 text-center {stylex.attrs(
					surfaces.empty,
				).class}"
				role="alert"
			>
				<span class="inline-flex items-center gap-1.5 {stylex.attrs(type.name).class}">
					<span class="inline-flex {stylex.attrs(tone.bad).class}"
						><TriangleAlert size={14} strokeWidth={2} /></span
					>Could not be read
				</span>
				<span class={stylex.attrs(type.soft).class}>{error}</span>
			</div>
		{:else if empty}
			<div
				class="flex h-full items-center justify-center px-4 {stylex.attrs(surfaces.empty, type.soft)
					.class}"
			>
				{emptyText}
			</div>
		{:else if tabular}
			<div class="h-full overflow-auto">
				<table>
					<caption class="sr-only">{label}</caption>
					<thead>
						<tr>
							{#each table.head as cell, index (index)}
								<th scope="col" class={table.numeric?.[index] ? 'text-right' : ''}>{cell}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each table.rows as row, index (index)}
							<tr>
								{#each row as cell, column (column)}
									<td
										class="py-1.5 {table.numeric?.[column] ? 'text-right' : ''} {stylex.attrs(
											type.body,
										).class}">{cell}</td
									>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="h-full {stylex.attrs(stale ? chart.stale : chart.fresh).class}">
				{@render children()}
			</div>
		{/if}
	</div>
</figure>

<script lang="ts">
	/**
	 * The top of a page: a state, a line of facts, and on the right what scopes the page -- the time
	 * range first, when the page loaded one. Its title is a heading for assistive technology alone.
	 */
	import * as stylex from '@stylexjs/stylex';
	import type { Snippet } from 'svelte';
	import { type } from '../style.ts';
	import Segmented, { RANGES, type Range } from './segmented.svelte';

	let {
		title,
		description,
		range,
		query = '',
		meta,
		actions,
	}: {
		title: string;
		/** Facts about the thing, never a sentence about the page. */
		description?: string;
		/** The span the page is drawn over, when it is drawn over one: each other span is a link. */
		range?: Range;
		/** The page's query, kept as each span's link changes only `range`. */
		query?: string;
		/** Beside the title: a state, a count. */
		meta?: Snippet;
		/** On the right, after the range. */
		actions?: Snippet;
	} = $props();

	const options = $derived(
		RANGES.map((one) => {
			const asked = new URLSearchParams(query);
			asked.set('range', one.key);
			return { key: one.key, label: one.label, href: `?${asked}` };
		}),
	);
</script>

<!-- The title is the top bar's, said once there; here it is for a reader of headings alone. See
     spec/console/design.md, "A page is named once, in the top bar". -->
<h1 class="sr-only">{title}</h1>
{#if meta || description || range || actions}
	<header class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			{#if meta}<div class="flex flex-wrap items-center gap-3">{@render meta()}</div>{/if}
			{#if description}<p class={stylex.attrs(type.soft).class}>{description}</p>{/if}
		</div>
		{#if range || actions}
			<div class="ml-auto flex flex-wrap items-center gap-2">
				{#if range}<Segmented {options} value={range} label="Time range" />{/if}
				{@render actions?.()}
			</div>
		{/if}
	</header>
{/if}

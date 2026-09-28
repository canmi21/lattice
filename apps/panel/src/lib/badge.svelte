<script lang="ts">
	/** A state, as a dot and a word in its color. */
	import * as stylex from '@stylexjs/stylex';
	import type { Snippet } from 'svelte';
	import { badges } from './style/surfaces';

	let {
		tone,
		children,
	}: { tone: 'good' | 'warn' | 'danger' | 'busy' | 'muted'; children: Snippet } = $props();
</script>

<span
	class="inline-flex h-5.5 items-center gap-1.5 px-2 whitespace-nowrap {stylex.attrs(
		badges.badge,
		badges[tone],
	).class}"
>
	<span class="size-1.5 shrink-0 {stylex.attrs(badges.dot).class}"></span>
	{@render children()}
</span>

<script lang="ts">
	/** A button, in the one shape the panel has, colored by what pressing it does. */
	import * as stylex from '@stylexjs/stylex';
	import type { Component, Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { controls } from './style/surfaces';

	let {
		variant = 'secondary',
		icon: Icon,
		children,
		class: extra = '',
		...rest
	}: HTMLButtonAttributes & {
		variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
		icon?: Component<{ size?: number; strokeWidth?: number }>;
		children?: Snippet;
	} = $props();
</script>

<button
	type="button"
	{...rest}
	class="inline-flex h-8 items-center justify-center gap-1.5 px-3 whitespace-nowrap disabled:cursor-not-allowed {stylex.attrs(
		controls.button,
		controls[variant],
	).class} {extra}"
>
	{#if Icon}<Icon size={14} strokeWidth={2} />{/if}
	{@render children?.()}
</button>

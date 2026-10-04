<script lang="ts">
	/** The top of a page: where it sits, what it is, a line on it, and what can be done from here. */
	import * as stylex from '@stylexjs/stylex';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import type { Snippet } from 'svelte';
	import { type } from './style/surfaces';
	import { duration } from './style/vocabulary.stylex';

	let {
		title,
		description,
		back,
		meta,
		actions,
	}: {
		title: string;
		description?: string;
		/** The page this one sits under. */
		back?: { href: string; label: string };
		/** Beside the title: a state, a count. */
		meta?: Snippet;
		actions?: Snippet;
	} = $props();

	const styles = stylex.create({
		back: {
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			transitionProperty: 'color',
			transitionDuration: duration.hover,
		},
	});
</script>

<header class="mb-6 flex flex-col gap-3">
	{#if back}
		<a
			href={back.href}
			class="inline-flex w-fit items-center gap-1 {stylex.attrs(type.muted, styles.back).class}"
		>
			<ChevronLeft size={14} strokeWidth={2} />{back.label}
		</a>
	{/if}
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<div class="flex flex-wrap items-center gap-3">
				<h1 class={stylex.attrs(type.title).class}>{title}</h1>
				{@render meta?.()}
			</div>
			{#if description}<p class={stylex.attrs(type.muted).class}>{description}</p>{/if}
		</div>
		{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
	</div>
</header>

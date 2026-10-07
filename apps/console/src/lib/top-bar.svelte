<script lang="ts">
	/**
	 * The view on the left, the page's name at the center whatever the sides hold, and the page's
	 * actions on the right. Fixed right of the sidebar; see spec/architecture/console.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Snippet } from 'svelte';
	import Switcher from './scope/switcher.svelte';
	import { type View, within } from './scope/scope.ts';
	import type { Section } from './sections.ts';
	import { surfaces, type } from './style.ts';

	let {
		view,
		section,
		detail,
		actions,
	}: { view: View; section?: Section; detail?: string; actions?: Snippet } = $props();

	const styles = stylex.create({
		crumb: {
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			fontSize: text.px14,
			transitionProperty: 'color',
			transitionDuration: duration.base,
		},
		here: {
			color: 'var(--color-text-strong)',
			fontSize: text.px14,
		},
		slash: {
			color: 'var(--color-line-strong)',
		},
	});
</script>

{#snippet slash()}
	<svg
		class="shrink-0 {stylex.attrs(styles.slash).class}"
		width="16"
		height="16"
		viewBox="0 0 16 16"
		fill="none"
		aria-hidden="true"
	>
		<path d="M10.5 2.5 5.5 13.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
	</svg>
{/snippet}

<header
	class="fixed top-0 right-0 left-60 z-30 grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-4 px-8 {stylex.attrs(
		surfaces.bar,
	).class}"
>
	<div class="flex min-w-0 items-center justify-self-start">
		<Switcher {view} {section} />
	</div>
	<nav aria-label="Breadcrumb" class="flex max-w-[40vw] min-w-0 items-center gap-2">
		{#if section}
			{#if detail}
				<a href={within(view, section.path)} class="shrink-0 {stylex.attrs(styles.crumb).class}"
					>{section.label}</a
				>
				{@render slash()}
				<span class="truncate {stylex.attrs(styles.here, type.mono).class}" aria-current="page"
					>{detail}</span
				>
			{:else}
				<span class={stylex.attrs(styles.here).class} aria-current="page">{section.label}</span>
			{/if}
		{/if}
	</nav>
	<div class="flex min-w-0 items-center gap-2 justify-self-end">
		{@render actions?.()}
	</div>
</header>

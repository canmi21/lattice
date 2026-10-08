<script lang="ts">
	/**
	 * The view on the left, the page's name at the center whatever the sides hold, and the page's
	 * actions on the right. Fixed right of the sidebar; see spec/architecture/console.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { applyTheme, currentTheme, themeCookie } from '@canmi/kit/theme';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import BrightnessIcon from '@tabler/icons-svelte-runes/icons/brightness-filled';
	import type { Snippet } from 'svelte';
	import Switcher from './scope/switcher.svelte';
	import { type View, within } from './scope/scope.ts';
	import type { Section } from './sections.ts';
	import { surfaces, type } from './style.ts';
	import { offsetOf, timeZone } from './ui/time-zone.ts';

	let {
		view,
		section,
		detail,
		code,
		actions,
	}: {
		view: View;
		section?: Section;
		detail?: string;
		/** The key beside a `detail` that is a display name, as a node's city takes its code. */
		code?: string;
		actions?: Snippet;
	} = $props();

	const zone = timeZone();

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
		code: {
			color: 'var(--color-text-muted)',
			fontSize: text.px12,
		},
		/** The zone every moment on the page is written in, quiet beside the page's own actions. */
		zone: {
			color: 'var(--color-text-muted)',
			fontSize: text.px13,
			fontVariantNumeric: 'tabular-nums',
		},
		theme: {
			backgroundColor: {
				default: 'transparent',
				':hover': 'color-mix(in srgb, var(--color-raised) 55%, transparent)',
			},
			borderWidth: 0,
			borderRadius: 6,
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			cursor: 'pointer',
			transitionProperty: 'color, background-color',
			transitionDuration: duration.base,
		},
	});

	function toggleTheme() {
		const next = currentTheme() === 'dark' ? 'light' : 'dark';
		applyTheme(next);
		document.cookie = themeCookie(next);
	}
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
				{#if code}
					<span class="flex min-w-0 items-baseline gap-2" aria-current="page">
						<span class="truncate {stylex.attrs(styles.here).class}">{detail}</span>
						<span class={stylex.attrs(type.mono, styles.code).class}>{code}</span>
					</span>
				{:else}
					<span class="truncate {stylex.attrs(styles.here, type.mono).class}" aria-current="page"
						>{detail}</span
					>
				{/if}
			{:else}
				<span class={stylex.attrs(styles.here).class} aria-current="page">{section.label}</span>
			{/if}
		{/if}
	</nav>
	<div class="flex min-w-0 items-center gap-2 justify-self-end">
		{@render actions?.()}
		<!-- The request's zone, as the charts write it; see spec/architecture/console.md. -->
		<span class={stylex.attrs(styles.zone).class} title={zone}>{offsetOf(zone)}</span>
		<button
			type="button"
			onclick={toggleTheme}
			aria-label="Switch between light and dark"
			title="Switch between light and dark"
			class="inline-flex size-8 items-center justify-center {stylex.attrs(styles.theme).class}"
		>
			<!-- One mark for both, mirrored in the dark so its filled half changes side. -->
			<BrightnessIcon size={18} aria-hidden="true" class="dark:-scale-x-100" />
		</button>
	</div>
</header>

<script lang="ts">
	/**
	 * An action's button: 32 px tall, filled in the strongest text color when it is the page's
	 * primary action and on the surface otherwise. A button with an `href` is a link.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		variant = 'secondary',
		href,
		type = 'button',
		children,
		...rest
	}: {
		variant?: 'primary' | 'secondary';
		href?: string;
		children: Snippet;
	} & HTMLButtonAttributes = $props();

	const styles = stylex.create({
		base: {
			height: '2rem',
			paddingInline: '0.75rem',
			gap: '0.375rem',
			borderRadius: radius.md,
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			fontSize: text.px14,
			fontWeight: weight.medium,
			whiteSpace: 'nowrap',
			cursor: { default: 'pointer', ':disabled': 'not-allowed' },
			opacity: { default: 1, ':disabled': 0.5 },
			transitionProperty: 'color, background-color, border-color',
			transitionDuration: duration.base,
		},
		primary: {
			backgroundColor: {
				default: 'var(--color-text-strong)',
				':hover': 'color-mix(in srgb, var(--color-text-strong) 85%, transparent)',
			},
			borderColor: 'transparent',
			color: 'var(--color-ground)',
		},
		secondary: {
			backgroundColor: { default: 'var(--color-surface)', ':hover': 'var(--color-raised)' },
			borderColor: 'var(--color-line)',
			color: 'var(--color-text-strong)',
		},
	});
	const kind = $derived(stylex.attrs(styles.base, styles[variant]).class);
</script>

{#if href}
	<a {href} class="inline-flex items-center justify-center {kind}">{@render children()}</a>
{:else}
	<button {type} {...rest} class="inline-flex items-center justify-center {kind}"
		>{@render children()}</button
	>
{/if}

<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { easing, line, radius, text, transition } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the modal. Every colour is the token variable `libs/tokens` already
	 * declares, so nothing here can change one. See spec/architecture/css.md, including for why
	 * this comment may not write a tag in angle brackets.
	 *
	 * The scoped block at the foot of this file is `:global` because Bits UI portals the overlay
	 * and the surface out of the component tree, reaching them by the library's own data
	 * attributes rather than anything this component could put a class on.
	 */
	const styles = stylex.create({
		/**
		 * The floating card. Where it is and how wide stays in the markup, and so does
		 * `shadow-sm`: Tailwind composes that property out of five registered variables and the
		 * visual layer has no way to make an `@property` registration, so the utility and its
		 * variable move together or not at all. See spec/todo.md.
		 */
		surface: {
			borderRadius: radius.lg,
			color: 'var(--color-text)',
		},
		/** The optional mark, quiet beside the title it stands next to. */
		mark: {
			color: 'var(--color-text-soft)',
		},
		close: {
			borderRadius: radius.md,
			// No fill at rest: the card behind it is the resting surface, and only the two states
			// name a colour of their own.
			backgroundColor: {
				default: null,
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the fill from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-paper-hover)' },
				':focus-visible': 'var(--color-paper-hover)',
			},
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
			// The whole of `transition-colors`, the three `--tw-gradient-*` variables included.
			// Nothing here sets a gradient and they animate nothing, but the measure of sameness
			// is the computed value and dropping them changes it. See spec/todo.md.
			transitionProperty: transition.colors,
			transitionDuration: '150ms',
			transitionTimingFunction: easing.inOut,
		},
		/**
		 * The body. Its line is Tailwind's `--leading-relaxed` written out rather than read: that
		 * variable is named by nothing but its own utility, so a value this file was the last
		 * reader of would resolve to nothing once the class left the markup.
		 */
		body: {
			fontSize: text.px15,
			lineHeight: line.relaxed,
			textWrap: 'pretty',
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		open,
		title,
		closeLabel,
		icon,
		onOpenChange,
		children,
	}: {
		open: boolean;
		title: string;
		closeLabel: string;
		/** Optional mark for the surface, usually the icon of the action that opened it. */
		icon?: Snippet;
		onOpenChange: (open: boolean) => void;
		children: Snippet;
	} = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="modal-overlay fixed inset-0 z-50" />
		<Dialog.Content
			class="modal-content fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-3rem))] p-5 shadow-sm {stylex.attrs(
				surfaces.paper,
				styles.surface,
			).class}"
		>
			<!-- The mark and the close control are each centred on a 1.5rem box so they sit on the
			first line of the title rather than on the whole header, which a wrapped title moves. -->
			<div class="flex items-start gap-2.5">
				{#if icon}
					<span class="flex h-6 shrink-0 items-center {stylex.attrs(styles.mark).class}">
						{@render icon()}
					</span>
				{/if}
				<Dialog.Title class="min-w-0 flex-1 {stylex.attrs(surfaces.heading).class}">{title}</Dialog.Title
				>
				<Dialog.Close
					aria-label={closeLabel}
					class="focus-ring -mt-0.5 -mr-1 inline-flex size-7 shrink-0 items-center justify-center {stylex.attrs(
						styles.close,
					).class}"
				>
					<X class="size-4" aria-hidden="true" />
				</Dialog.Close>
			</div>
			<Dialog.Description class="mt-2 {stylex.attrs(styles.body).class}">
				{@render children()}
			</Dialog.Description>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.modal-overlay) {
		background: color-mix(in oklch, var(--color-page) 38%, transparent);
		-webkit-backdrop-filter: blur(0.5rem);
		backdrop-filter: blur(0.5rem);
		transition: opacity 150ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	:global(.modal-content) {
		transform: translate(-50%, -50%);
		transition:
			opacity 150ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 150ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	:global(.modal-overlay[data-starting-style]),
	:global(.modal-overlay[data-ending-style]),
	:global(.modal-content[data-starting-style]),
	:global(.modal-content[data-ending-style]) {
		opacity: 0;
	}

	:global(.modal-content[data-starting-style]),
	:global(.modal-content[data-ending-style]) {
		transform: translate(-50%, -50%) scale(0.98);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.modal-overlay),
		:global(.modal-content) {
			transition: none;
		}
	}
</style>

<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';

	/**
	 * The visual half of the popover surface. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css.md.
	 *
	 * The block at the foot of this file is not a leftover of the migration. Bits UI portals this
	 * surface out of the component tree, so a Svelte scoped rule cannot reach it and every rule
	 * there is `:global`. A StyleX style reaches it perfectly well, because a class travels with
	 * the element wherever the portal puts it.
	 *
	 * `shadow-sm` stayed in the markup beside them, and it is the one token here that is visual
	 * and did not move. Tailwind composes a shadow through five private variables and sets a
	 * sixth, so moving it means writing another framework's internals as declarations of ours --
	 * and writing the shadow plainly instead changes the computed value from six shadows to two.
	 * Recorded in spec/todo.md rather than decided here.
	 */
	const styles = stylex.create({
		/** The floating surface itself: its edge, its ground and the type it holds. */
		surface: {
			borderRadius: '0.375rem',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-border)',
			backgroundColor: 'var(--color-paper)',
			fontSize: '0.875rem',
			// `leading-relaxed` is Tailwind's `--leading-relaxed`, and its value is written out
			// rather than read: that variable is emitted only for the utilities that name it, so
			// reading it here would leave this line depending on a class somewhere else in the
			// markup. The value terminates, so there is no arithmetic to round.
			lineHeight: 1.625,
			color: 'var(--color-text)',
		},
	});
</script>

<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		anchor,
		id,
		labelledby,
		describedby,
		onEscapeKeydown,
		onInteractOutside,
		onOpenAutoFocus,
		onCloseAutoFocus,
		children,
	}: {
		anchor: HTMLElement | null;
		id?: string;
		labelledby?: string;
		describedby?: string;
		onEscapeKeydown?: (event: KeyboardEvent) => void;
		onInteractOutside?: (event: PointerEvent) => void;
		onOpenAutoFocus?: (event: Event) => void;
		onCloseAutoFocus?: (event: Event) => void;
		children: Snippet;
	} = $props();
</script>

<Popover.Portal>
	<Popover.Content
		{id}
		customAnchor={anchor}
		side="bottom"
		align="center"
		sideOffset={10}
		collisionPadding={12}
		strategy="fixed"
		role="note"
		aria-labelledby={labelledby}
		aria-describedby={describedby}
		{onEscapeKeydown}
		{onInteractOutside}
		{onOpenAutoFocus}
		{onCloseAutoFocus}
		class="popover-content z-40 overflow-hidden shadow-sm {stylex.attrs(styles.surface).class}"
	>
		{@render children()}
	</Popover.Content>
</Popover.Portal>

<style>
	:global(.popover-content) {
		width: min(26rem, calc(100vw - 1.5rem));
		transition:
			opacity 150ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 150ms cubic-bezier(0.22, 1, 0.36, 1);
		transform-origin: var(--bits-popover-content-transform-origin);
	}

	:global(.popover-content[data-starting-style]),
	:global(.popover-content[data-ending-style]) {
		opacity: 0;
		transform: scale(0.98);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.popover-content) {
			transition: none;
		}
	}
</style>

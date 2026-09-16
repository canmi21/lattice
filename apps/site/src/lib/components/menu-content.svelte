<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { radius } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of a dropdown's panel. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one -- see spec/architecture/css.md, "A
	 * comment in the module script cannot write a tag in angle brackets", for why this one may not.
	 *
	 * The scoped block at the foot of this file reaches what Bits UI portals out of the tree,
	 * through data attributes the library writes. `shadow-sm` stays in the markup because it is
	 * five variables, four of them registered by an `@property` rule no component can write.
	 */
	const styles = stylex.create({
		/** The panel itself: a bordered sheet of paper. Its shadow is still the markup's. */
		surface: {
			// 0.375rem is the `--radius-md` behind `rounded-md`.
			borderRadius: radius.md,
		},
	});
</script>

<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		id,
		align = 'start',
		children,
	}: {
		id?: string;
		/** Which of the trigger's edges the panel lines up with. */
		align?: 'start' | 'end';
		children: Snippet;
	} = $props();

	/**
	 * How close this surface may come to the window's edge, in pixels: the page's own gutter, so a
	 * menu pushed back by a collision stops where the article's text stops. The library's default
	 * of 8px is invisible on a laptop and puts a phone's panel against the screen's edge -- see
	 * spec/styling/controls.md. A number rather than the token because the library cannot read a
	 * custom property; it agrees with the article column's `px-6` by hand.
	 */
	const EDGE_PADDING = 24;
</script>

<DropdownMenu.Portal>
	<DropdownMenu.Content
		{id}
		{align}
		sideOffset={8}
		collisionPadding={EDGE_PADDING}
		loop
		class="menu-content z-30 min-w-36 overflow-hidden shadow-sm {stylex.attrs(surfaces.paper, styles.surface).class}"
	>
		{@render children()}
	</DropdownMenu.Content>
</DropdownMenu.Portal>

<style>
	:global(.menu-content) {
		transition:
			opacity 150ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 150ms cubic-bezier(0.22, 1, 0.36, 1);
		transform-origin: var(--bits-dropdown-menu-content-transform-origin);
	}

	:global(.menu-content[data-starting-style]),
	:global(.menu-content[data-ending-style]) {
		opacity: 0;
		transform: scale(0.98);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.menu-content) {
			transition: none;
		}
	}
</style>

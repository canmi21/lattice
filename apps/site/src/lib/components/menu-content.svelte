<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { radius } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of a dropdown's panel. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css.md.
	 *
	 * The scoped block at the foot of this file is not a leftover of the migration. Bits UI
	 * portals this surface out of the component tree, which is why those rules are `:global`,
	 * and the two they gate are reached through data attributes the library writes rather than
	 * through anything this component could put a class on.
	 *
	 * `shadow-sm` stays in the markup beside the layout. It is not one declaration: Tailwind puts
	 * the real shadows in `--tw-shadow` and points `box-shadow` at five variables, four of them
	 * registered as transparent by an `@property` rule no component can write. That registration
	 * is the member of the set which cannot follow, so the set stays whole.
	 *
	 * Nothing in this block may write a tag in angle brackets, in a comment or anywhere else:
	 * oxfmt then deletes the whole instance script below, silently and with a zero exit status.
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
	 * How close this surface may come to the window's edge, in pixels.
	 *
	 * The page's own gutter, so a menu pushed back by a collision stops where the article's text
	 * stops rather than a hair from the glass. The library's default is 8px, which is invisible on
	 * a laptop -- nothing there is near an edge -- and on a phone puts the whole panel against the
	 * side of the screen while the column beside it holds a 1.5rem margin. See spec/styling.md.
	 *
	 * A number rather than the token, because the library measures in pixels and cannot read a
	 * custom property. It agrees with the article column's `px-6` by hand.
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

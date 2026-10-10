<script lang="ts">
	/**
	 * Every menu's panel, one way: the surface ruled and shadowed, its rows edge to edge with no
	 * inset of its own, scrolled without a bar where the window is too short, and arriving from a
	 * step smaller at its top left. The rows are ./menu-row.svelte. See spec/console/design.md, "A
	 * choice in a card's head is its title".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, radius, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { unfold } from '../design/motion.ts';

	let {
		label,
		sideOffset = 6,
		alignOffset = 0,
		ref = $bindable(null),
		class: className = '',
		children,
	}: {
		/** What the menu is of, for assistive technology. */
		label: string;
		sideOffset?: number;
		alignOffset?: number;
		ref?: HTMLElement | null;
		/** Its width's floor, where the trigger is narrower than its rows want. */
		class?: string;
		children: Snippet;
	} = $props();

	const styles = stylex.create({
		menu: {
			backgroundColor: 'var(--color-surface)',
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: radius.lg,
			boxShadow: '0 4px 12px rgb(0 0 0 / 0.25), 0 1px 3px rgb(0 0 0 / 0.2)',
			fontSize: text.px13,
			/** Scrolled where the window is too short, without a bar drawn over its rows. */
			scrollbarWidth: 'none',
		},
	});
</script>

<DropdownMenu.Portal>
	<DropdownMenu.Content
		{sideOffset}
		align="start"
		{alignOffset}
		loop
		aria-label={label}
		bind:ref
		class="z-40 flex max-h-(--bits-floating-available-height) w-max min-w-(--bits-floating-anchor-width) flex-col overflow-y-auto {className} {stylex.attrs(
			styles.menu,
		).class}"
		{@attach unfold}
	>
		{@render children()}
	</DropdownMenu.Content>
</DropdownMenu.Portal>

<script lang="ts">
	/**
	 * The handle beside the block under the pointer, and the line a dragged block would land on.
	 *
	 * Drawn only; where it stands and what pressing it does belong to the plugin that mounts it.
	 * See spec/architecture/local.md, "Every block has a handle".
	 */
	import * as stylex from '@stylexjs/stylex';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { radius } from '@canmi/tokens/vocabulary.stylex';
	import type { GripState } from './block-props.svelte';

	let { grip, press }: { grip: GripState; press: (event: PointerEvent) => void } = $props();

	const styles = stylex.create({
		handle: {
			borderRadius: radius.md,
			color: {
				default: 'var(--color-text-muted)',
				':hover': 'var(--color-text-strong)',
			},
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-paper-hover)',
			},
		},
		held: { cursor: 'grabbing' },
		line: { backgroundColor: 'var(--color-text-soft)', borderRadius: radius.full },
	});
</script>

<button
	type="button"
	aria-label="Block actions"
	title="Click for actions, drag to move"
	hidden={!grip.shown}
	style:top="{grip.top}px"
	style:left="{grip.left}px"
	onpointerdown={press}
	class="fixed z-20 grid h-6 w-5 cursor-grab touch-none place-items-center {stylex.attrs(
		styles.handle,
		grip.dragging && styles.held,
	).class}"
>
	<GripVertical class="size-4" aria-hidden="true" />
</button>

{#if grip.line}
	<div
		aria-hidden="true"
		style:top="{grip.line.top - 1}px"
		style:left="{grip.line.left}px"
		style:width="{grip.line.width}px"
		class="pointer-events-none fixed z-20 h-0.5 {stylex.attrs(styles.line).class}"
	></div>
{/if}

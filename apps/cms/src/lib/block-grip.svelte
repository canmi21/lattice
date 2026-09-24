<script lang="ts">
	/**
	 * The handle beside the block under the pointer, and while a block is dragged, the line it would
	 * land on and the outline of the room it would take there.
	 *
	 * Drawn only; where each stands and what pressing does belong to text-handle.ts. See
	 * spec/architecture/local.md, "Every block has a handle".
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
		held: { cursor: 'grabbing', color: 'var(--color-text-strong)' },
		// The landing line: the accent, so it reads as where something goes rather than as a rule
		// of the page, with a ring at its start the way a caret has a stem.
		line: { backgroundColor: 'var(--color-accent)', borderRadius: radius.full },
		ring: {
			borderWidth: '2px',
			borderStyle: 'solid',
			borderColor: 'var(--color-accent)',
			backgroundColor: 'var(--color-page)',
			borderRadius: radius.full,
		},
		// The room it would take: dashed, so it reads as a place held rather than a thing there,
		// and faintly filled so the size can be seen against a component behind it.
		outline: {
			borderWidth: '1.5px',
			borderStyle: 'dashed',
			borderColor: 'var(--color-accent)',
			borderRadius: radius.lg,
			backgroundColor: 'color-mix(in oklab, var(--color-accent) 6%, transparent)',
		},
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
		style:top="{grip.line.top}px"
		style:left="{grip.line.left}px"
		style:width="{grip.line.width}px"
		class="pointer-events-none fixed z-20 -translate-y-1/2"
	>
		<div class="h-0.5 {stylex.attrs(styles.line).class}"></div>
		<div
			class="absolute top-1/2 -left-1.5 size-2.5 -translate-y-1/2 {stylex.attrs(styles.ring).class}"
		></div>
	</div>
{/if}

{#if grip.outline}
	<!-- Drawn over the page and taking no room in it: what is below moves only once the block is
	     let go. -->
	<div
		aria-hidden="true"
		style:top="{grip.outline.top}px"
		style:left="{grip.outline.left}px"
		style:width="{grip.outline.width}px"
		style:height="{grip.outline.height}px"
		class="pointer-events-none fixed z-10 {stylex.attrs(styles.outline).class}"
	></div>
{/if}

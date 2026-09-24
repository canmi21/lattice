<script module lang="ts">
	import type { Component } from 'svelte';
	import Box from '@lucide/svelte/icons/box';
	import Code from '@lucide/svelte/icons/code';
	import Film from '@lucide/svelte/icons/film';
	import Heading from '@lucide/svelte/icons/heading';
	import Image from '@lucide/svelte/icons/image';
	import List from '@lucide/svelte/icons/list';
	import Minus from '@lucide/svelte/icons/minus';
	import Pilcrow from '@lucide/svelte/icons/pilcrow';
	import Table from '@lucide/svelte/icons/table';
	import TextQuote from '@lucide/svelte/icons/text-quote';

	/** The icon a dragged block's card carries, by what the block is. */
	const KINDS: Record<string, Component> = {
		paragraph: Pilcrow,
		heading: Heading,
		blockquote: TextQuote,
		list: List,
		code: Code,
		table: Table,
		rule: Minus,
		image: Image,
		video: Film,
	};
</script>

<script lang="ts">
	/**
	 * The handle beside the block under the pointer, and while a block is dragged, the card that
	 * carries it and the line it would land on.
	 *
	 * Drawn only; where each stands and what pressing does belong to text-handle.ts. See
	 * spec/architecture/local.md, "Every block has a handle".
	 */
	import * as stylex from '@stylexjs/stylex';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { radius, text } from '@canmi/tokens/vocabulary.stylex';
	import type { GripState } from './block-props.svelte';

	let { grip, press }: { grip: GripState; press: (event: PointerEvent) => void } = $props();

	const Kind = $derived(grip.ghost ? (KINDS[grip.ghost.kind] ?? Box) : Box);

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
		card: {
			boxShadow: '0 0.75rem 2rem oklch(0 0 0 / 0.18)',
			color: 'var(--color-text-strong)',
			fontSize: text.px13,
		},
		kind: { color: 'var(--color-text-soft)' },
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

{#if grip.ghost}
	<!-- What is in the hand: the block's kind and its first words, beside the pointer. -->
	<div
		aria-hidden="true"
		style:top="{grip.ghost.y + 12}px"
		style:left="{grip.ghost.x + 14}px"
		class="pointer-events-none fixed z-30 flex max-w-80 items-center gap-2 px-3 py-2 {stylex.attrs(
			surfaces.menu,
			styles.card,
		).class}"
	>
		<Kind class="size-4 shrink-0 {stylex.attrs(styles.kind).class}" aria-hidden="true" />
		<span class="truncate">{grip.ghost.label || 'Empty line'}</span>
	</div>
{/if}

<script lang="ts">
	/**
	 * One row of a menu, every menu's one way: the menu's whole width, edge to edge, washed under
	 * the pointer at the stronger tier, a mark's column on each side of its words -- the left for
	 * what the row is, a chevron or an app's icon; the right for its state or where it goes, a check
	 * or an arrow -- either column there but empty where the row has no mark, so every row's words
	 * start and end at one edge. A rule over it takes no room. See spec/console/design.md, "A choice
	 * in a card's head is its title".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Icon from '../design/icon.svelte';
	import type { IconComponent } from '../design/optics.ts';

	let {
		href,
		onselect,
		keep = false,
		disabled = false,
		lead,
		trail,
		marks = true,
		quiet = false,
		ruled = false,
		current = false,
		expanded,
		children,
	}: {
		/** Where it leads; a row without one chooses through `onselect`. */
		href?: string;
		onselect?: () => void;
		/** Chosen, the menu stays open: a group's head. */
		keep?: boolean;
		disabled?: boolean;
		/** The left column's mark. */
		lead?: IconComponent;
		/** The right column's mark. */
		trail?: IconComponent;
		/** Whether the row keeps the left column at all; a plain list keeps none. */
		marks?: boolean;
		/** In the muted ink at rest, as a group's head is. */
		quiet?: boolean;
		/** A rule over it, parting it from the rows above. */
		ruled?: boolean;
		/** The page or choice it stands for is the one open. */
		current?: boolean;
		expanded?: boolean;
		children: Snippet;
	} = $props();

	const styles = stylex.create({
		row: {
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-selected)',
				':focus-visible': 'var(--color-selected)',
			},
		},
		mark: { color: 'var(--color-text-muted)' },
		rule: { backgroundColor: 'var(--color-line)' },
	});
	const ROW = 'relative flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2';
</script>

{#snippet column(icon: IconComponent | undefined, strong: boolean)}
	<span
		aria-hidden="true"
		class="flex w-3.5 shrink-0 justify-center {strong ? '' : stylex.attrs(styles.mark).class}"
	>
		{#if icon}<Icon {icon} size={14} />{/if}
	</span>
{/snippet}

{#snippet body()}
	{#if ruled}
		<!-- A rule drawn, not laid out: no height and no gap of its own. -->
		<span
			aria-hidden="true"
			class="absolute inset-x-0 -top-[0.5px] h-px {stylex.attrs(styles.rule).class}"
		></span>
	{/if}
	{#if marks}{@render column(lead, false)}{/if}
	<span class="flex-1 whitespace-nowrap">{@render children()}</span>
	{@render column(trail, current)}
{/snippet}

{#if href}
	<DropdownMenu.Item {disabled}>
		{#snippet child({ props })}
			<a
				{...props}
				{href}
				aria-current={current ? 'page' : undefined}
				class="{ROW} {stylex.attrs(styles.row).class}"
			>
				{@render body()}
			</a>
		{/snippet}
	</DropdownMenu.Item>
{:else}
	<DropdownMenu.Item
		{disabled}
		closeOnSelect={!keep}
		onSelect={onselect}
		aria-expanded={expanded}
		class="{ROW} {stylex.attrs(styles.row, quiet && styles.mark).class}"
	>
		{@render body()}
	</DropdownMenu.Item>
{/if}

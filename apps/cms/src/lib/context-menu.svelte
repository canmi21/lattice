<script module lang="ts">
	import type { Component } from 'svelte';

	/**
	 * One entry: what it says, what it does, and whether it is the destructive one. `refused` names
	 * why it cannot be done, and the entry is shown but cannot be chosen. `stays` keeps the menu
	 * open after it runs -- the first half of an action that asks twice.
	 */
	export type MenuEntry = {
		label: string;
		icon?: Component;
		run: () => void | Promise<void>;
		danger?: boolean;
		refused?: string;
		stays?: boolean;
	};

	/** A line between groups of entries. */
	export const SEPARATOR = 'separator';

	export type MenuItem = MenuEntry | typeof SEPARATOR;
</script>

<script lang="ts">
	/**
	 * A menu opened where the pointer asked for it, standing in for the browser's own on the places
	 * that offer one -- and only there: everywhere else a right click is the browser's. See
	 * spec/architecture/local.md.
	 *
	 * It draws the menu style the site's dropdowns draw, `surfaces.menu`, rather than the ground the
	 * sidebar stands on: a menu is a thing laid over the page, not a part of the panel it came from.
	 *
	 * It keeps to the window, takes the keyboard while it is open -- the arrows move, Enter chooses,
	 * Escape and Tab leave -- and goes away on a press anywhere else, or when the window loses focus
	 * or changes size, since the place it was opened for may no longer be where it was.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { onMount, tick } from 'svelte';

	let { x, y, items, close }: { x: number; y: number; items: MenuItem[]; close: () => void } =
		$props();

	let menu = $state<HTMLElement>();
	let left = $state(0);
	let top = $state(0);

	/** Kept inside the window with the same margin the ground keeps. */
	const MARGIN = 8;

	onMount(async () => {
		left = x;
		top = y;
		await tick();
		if (!menu) return;
		const box = menu.getBoundingClientRect();
		left = Math.max(MARGIN, Math.min(x, window.innerWidth - box.width - MARGIN));
		top = Math.max(MARGIN, Math.min(y, window.innerHeight - box.height - MARGIN));
		enabled()[0]?.focus();
	});

	const enabled = () =>
		[...(menu?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') ?? [])].filter(
			(button) => !button.disabled,
		);

	function step(by: number) {
		const buttons = enabled();
		if (buttons.length === 0) return;
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		buttons[(at + by + buttons.length) % buttons.length]?.focus();
	}

	function key(event: KeyboardEvent) {
		if (event.key === 'Escape' || event.key === 'Tab') {
			event.preventDefault();
			close();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			step(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			step(-1);
		}
	}

	function pressed(event: PointerEvent) {
		if (menu && !menu.contains(event.target as Node)) close();
	}

	async function choose(entry: MenuEntry) {
		if (entry.refused) return;
		if (!entry.stays) close();
		await entry.run();
	}

	const styles = stylex.create({
		// Square rows, edge to edge, as the site's menu has them: the panel's corner is the only one.
		row: { borderRadius: 0 },
		danger: {
			color: {
				default: 'var(--color-red)',
				':hover': 'var(--color-red)',
				':focus-visible': 'var(--color-red)',
			},
		},
		refused: {
			color: 'var(--color-text-soft)',
			opacity: 0.6,
		},
		rule: { backgroundColor: 'var(--color-border)' },
	});
</script>

<svelte:document onpointerdown={pressed} onkeydown={key} />
<svelte:window onblur={close} onresize={close} />

<div
	bind:this={menu}
	role="menu"
	tabindex="-1"
	style:left="{left}px"
	style:top="{top}px"
	class="fixed z-50 flex min-w-44 flex-col overflow-hidden shadow-sm {stylex.attrs(
		surfaces.uiText,
		surfaces.menu,
	).class}"
>
	{#each items as item, index (index)}
		{#if item === SEPARATOR}
			<div role="separator" class="my-1 h-px {stylex.attrs(styles.rule).class}"></div>
		{:else}
			<button
				type="button"
				role="menuitem"
				disabled={item.refused !== undefined}
				title={item.refused}
				onclick={() => void choose(item)}
				class="flex items-center gap-2 px-2 py-1 text-left {item.refused
					? 'cursor-not-allowed'
					: 'cursor-pointer'} {stylex.attrs(
					surfaces.quietControl,
					styles.row,
					item.danger && styles.danger,
					item.refused !== undefined && styles.refused,
				).class}"
			>
				{#if item.icon}<item.icon class="size-4 shrink-0" aria-hidden="true" />{/if}
				<span class="truncate">{item.label}</span>
			</button>
		{/if}
	{/each}
</div>

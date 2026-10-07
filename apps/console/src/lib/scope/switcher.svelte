<script lang="ts">
	/**
	 * The view being read, and a menu of every one: each is a link to the same section in that view,
	 * or to its overview where it has no such section. Opened by a click or the arrow keys, closed
	 * by Escape, a pick or a click anywhere else.
	 */
	import * as stylex from '@stylexjs/stylex';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import { duration, radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import { tick } from 'svelte';
	import { hrefIn, type Section } from '../sections.ts';
	import { VIEWS, type View, labelOf } from './scope.ts';

	let { view, section }: { view: View; section: Section | undefined } = $props();

	let open = $state(false);
	let root: HTMLElement | undefined = $state();
	let trigger: HTMLButtonElement | undefined = $state();
	const items = () => [...(root?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];

	async function show(at: 'current' | 'first' | 'last' = 'current') {
		open = true;
		await tick();
		const all = items();
		const current = all.find((one) => one.getAttribute('aria-checked') === 'true');
		(at === 'first' ? all[0] : at === 'last' ? all.at(-1) : (current ?? all[0]))?.focus();
	}

	function hide(refocus = false) {
		open = false;
		if (refocus) trigger?.focus();
	}

	function onTrigger(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			void show(event.key === 'ArrowDown' ? 'first' : 'last');
		}
	}

	function onMenu(event: KeyboardEvent) {
		const all = items();
		const at = all.indexOf(document.activeElement as HTMLElement);
		const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
		if (step !== undefined) {
			event.preventDefault();
			all[(at + step + all.length) % all.length]?.focus();
		} else if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			(event.key === 'Home' ? all[0] : all.at(-1))?.focus();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			hide(true);
		} else if (event.key === 'Tab') {
			hide();
		}
	}

	function outside(event: PointerEvent) {
		if (open && root && !root.contains(event.target as Node)) hide();
	}

	const styles = stylex.create({
		trigger: {
			height: '2rem',
			paddingInline: '0.5rem',
			gap: '0.375rem',
			borderRadius: radius.md,
			backgroundColor: {
				default: 'transparent',
				':hover': 'color-mix(in srgb, var(--color-raised) 55%, transparent)',
			},
			color: 'var(--color-text-strong)',
			fontSize: text.px14,
			fontWeight: weight.medium,
			cursor: 'pointer',
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		chevron: { color: 'var(--color-text-muted)' },
		menu: {
			minWidth: 200,
			padding: 4,
			backgroundColor: 'var(--color-surface)',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: 8,
			boxShadow: '0 4px 12px rgb(0 0 0 / 0.25), 0 1px 3px rgb(0 0 0 / 0.2)',
			fontSize: text.px14,
		},
		item: {
			height: '2rem',
			paddingInline: '0.5rem',
			borderRadius: radius.md,
			outline: 'none',
			color: { default: 'var(--color-text)', ':hover': 'var(--color-text-strong)' },
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-raised)',
				':focus-visible': 'var(--color-raised)',
			},
		},
		checked: { color: 'var(--color-text-strong)' },
	});
</script>

<svelte:window onpointerdown={outside} />

<!-- Pulled left by its padding, so the name lines up with the page below. -->
<div bind:this={root} class="relative -ml-2">
	<button
		bind:this={trigger}
		type="button"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="View: {labelOf(view)}"
		onclick={() => (open ? hide() : void show())}
		onkeydown={onTrigger}
		class="inline-flex items-center {stylex.attrs(styles.trigger).class}"
	>
		{labelOf(view)}
		<ChevronsUpDown
			size={14}
			strokeWidth={1.75}
			aria-hidden="true"
			class={stylex.attrs(styles.chevron).class}
		/>
	</button>
	{#if open}
		<div
			role="menu"
			aria-label="Views"
			tabindex="-1"
			onkeydown={onMenu}
			class="absolute top-full left-0 z-40 mt-1.5 flex flex-col {stylex.attrs(styles.menu).class}"
		>
			{#each VIEWS as one (one.key)}
				{@const here = one.key === view}
				<a
					role="menuitemradio"
					aria-checked={here}
					tabindex="-1"
					href={hrefIn(one.key, section)}
					onclick={() => hide()}
					class="flex items-center justify-between gap-3 {stylex.attrs(
						styles.item,
						here && styles.checked,
					).class}"
				>
					{one.label}
					{#if here}<Check size={14} strokeWidth={2} aria-hidden="true" />{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

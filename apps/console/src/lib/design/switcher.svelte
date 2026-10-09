<script lang="ts">
	/**
	 * The view being read, at the top bar's left, and a menu of every view: each a link to the same
	 * section in that view, or to its overview where it has no such section. The menu's keys, focus
	 * and dismissal are Bits UI's, its arrival GSAP's; see spec/console/design.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import CheckIcon from '@tabler/icons-svelte-runes/icons/check';
	import CaretUpDownIcon from '@tabler/icons-svelte-runes/icons/selector';
	import { DropdownMenu } from 'bits-ui';
	import { hrefIn, type Section } from '../sections.ts';
	import Icon from './icon.svelte';
	import { arrive } from './motion.ts';
	import { VIEWS, type View, labelOf } from '../scope/scope.ts';

	let { view, section }: { view: View; section: Section | undefined } = $props();

	const styles = stylex.create({
		trigger: {
			borderRadius: radius.md,
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-hover)',
			},
			color: 'var(--color-text-strong)',
			fontSize: text.px14,
			fontWeight: weight.medium,
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		chevron: { color: 'var(--color-text-muted)' },
		menu: {
			backgroundColor: 'var(--color-surface)',
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: radius.lg,
			boxShadow: '0 4px 12px rgb(0 0 0 / 0.25), 0 1px 3px rgb(0 0 0 / 0.2)',
			fontSize: text.px14,
		},
		item: {
			borderRadius: radius.md,
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

<DropdownMenu.Root>
	<!-- Pulled left by its padding, so the name lines up with the page below. -->
	<DropdownMenu.Trigger
		aria-label="View: {labelOf(view)}"
		class="-ml-2 inline-flex h-8 cursor-pointer items-center gap-1.5 px-2 {stylex.attrs(
			styles.trigger,
		).class}"
	>
		{labelOf(view)}
		<Icon icon={CaretUpDownIcon} size={16} class={stylex.attrs(styles.chevron).class} />
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			sideOffset={6}
			align="start"
			loop
			aria-label="Views"
			class="z-40 flex min-w-50 flex-col p-1 {stylex.attrs(styles.menu).class}"
			{@attach arrive}
		>
			{#each VIEWS as one (one.key)}
				{@const here = one.key === view}
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a
							{...props}
							href={hrefIn(one.key, section)}
							aria-current={here ? 'page' : undefined}
							class="flex h-8 items-center justify-between gap-3 px-2 {stylex.attrs(
								styles.item,
								here && styles.checked,
							).class}"
						>
							{one.label}
							{#if here}<Icon icon={CheckIcon} size={16} stroke={2.5} />{/if}
						</a>
					{/snippet}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

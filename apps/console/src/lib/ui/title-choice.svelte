<script lang="ts" generics="Key extends string">
	/**
	 * A card's title that is its own choice: the chosen option's words, a chevron, and a menu of the
	 * others under it, in place of a framed switch in the card's head, a box set in a box; a framed
	 * switch stays where it floats over a drawing, as the map's does. After the options, under a rule
	 * that takes no room, the pages the card leads to, each with an arrow. The menu's keys, focus and
	 * dismissal are Bits UI's, its arrival GSAP's. See spec/console/design.md, "A choice in a card's
	 * head is its title".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, radius, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import ArrowUpRightIcon from '@tabler/icons-svelte-runes/icons/arrow-up-right';
	import CheckIcon from '@tabler/icons-svelte-runes/icons/check';
	import ChevronDownIcon from '@tabler/icons-svelte-runes/icons/chevron-down';
	import { DropdownMenu } from 'bits-ui';
	import Icon from '../design/icon.svelte';
	import { unfold } from '../design/motion.ts';
	import { type } from '../style.ts';

	let {
		options,
		value = $bindable(),
		label,
		links = [],
	}: {
		/** Each option's key, the title it gives the card, and whether a rule stands over it. */
		options: readonly { key: Key; title: string; rule?: boolean }[];
		value: Key;
		/** What the choice is of, for assistive technology: `How far back`. */
		label: string;
		/** Pages the card leads to, after the options: `View all`. */
		links?: readonly { title: string; href: string }[];
	} = $props();

	const chosen = $derived(options.find((one) => one.key === value) ?? options[0]);

	const styles = stylex.create({
		trigger: {
			borderRadius: radius.md,
			backgroundColor: { default: 'transparent', ':hover': 'var(--color-hover)' },
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
			fontSize: text.px13,
		},
		item: {
			borderRadius: radius.md,
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-hover)',
				':focus-visible': 'var(--color-hover)',
			},
		},
		/** The chosen option, at the selection's wash and in the strong ink, as a chosen link is. */
		checked: { color: 'var(--color-text-strong)', backgroundColor: 'var(--color-selected)' },
		rule: { backgroundColor: 'var(--color-line)' },
		away: { color: 'var(--color-text-muted)' },
	});
</script>

<!-- A rule drawn, not laid out: no height and no gap of its own, so the menu is as tall with it
     as without. -->
{#snippet rule()}
	<span
		aria-hidden="true"
		class="absolute inset-x-1 -top-[0.5px] h-px {stylex.attrs(styles.rule).class}"
	></span>
{/snippet}

<DropdownMenu.Root>
	<!-- Pulled left by its padding, so the words stand where a plain title's would. -->
	<DropdownMenu.Trigger
		aria-label="{label}: {chosen?.title}"
		class="-ml-1.5 inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 px-1.5 whitespace-nowrap {stylex.attrs(
			type.heading,
			styles.trigger,
		).class}"
	>
		{chosen?.title}
		<Icon icon={ChevronDownIcon} size={16} class={stylex.attrs(styles.chevron).class} />
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<!-- Its options' words under the title's, the menu as wide as the title and as the longest
		     of them needs. -->
		<DropdownMenu.Content
			sideOffset={6}
			align="start"
			alignOffset={-6}
			loop
			aria-label={label}
			class="z-40 flex max-h-(--bits-floating-available-height) w-max min-w-(--bits-floating-anchor-width) flex-col overflow-y-auto p-1 {stylex.attrs(
				styles.menu,
			).class}"
			{@attach unfold}
		>
			{#each options as one (one.key)}
				{@const here = one.key === value}
				<DropdownMenu.Item
					onSelect={() => (value = one.key)}
					class="relative flex h-7 shrink-0 cursor-pointer items-center justify-between gap-3 px-2 {stylex.attrs(
						styles.item,
						here && styles.checked,
					).class}"
				>
					{#if one.rule}{@render rule()}{/if}
					{one.title}
					{#if here}<Icon icon={CheckIcon} size={14} stroke={2} />{/if}
				</DropdownMenu.Item>
			{/each}
			{#if links.length}
				{#each links as one, index (one.href)}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a
								{...props}
								href={one.href}
								class="relative flex h-7 shrink-0 items-center justify-between gap-3 px-2 {stylex.attrs(
									styles.item,
								).class}"
							>
								{#if index === 0}{@render rule()}{/if}
								{one.title}
								<Icon icon={ArrowUpRightIcon} size={14} class={stylex.attrs(styles.away).class} />
							</a>
						{/snippet}
					</DropdownMenu.Item>
				{/each}
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

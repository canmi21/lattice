<script lang="ts" generics="Key extends string">
	/**
	 * A card's title that is its own choice: the chosen option's words, a chevron after them, and a
	 * menu of the others under it -- in place of a framed switch inside the card's head, which is
	 * a box set in a box. A framed switch stays where it floats over a drawing, as the map's does.
	 * After the options, under a rule, the places the card leads, each with an arrow off its edge.
	 * The menu's keys, focus and dismissal are Bits UI's, its arrival GSAP's. See
	 * spec/console/design.md, "A choice in a card's head is its title".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, radius, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import ArrowUpRightIcon from '@tabler/icons-svelte-runes/icons/arrow-up-right';
	import CheckIcon from '@tabler/icons-svelte-runes/icons/check';
	import ChevronDownIcon from '@tabler/icons-svelte-runes/icons/chevron-down';
	import { DropdownMenu } from 'bits-ui';
	import Icon from '../design/icon.svelte';
	import { arrive } from '../design/motion.ts';
	import { type } from '../style.ts';

	let {
		options,
		value = $bindable(),
		label,
		links = [],
	}: {
		/** Each option's key, and the title it gives the card. */
		options: readonly { key: Key; title: string }[];
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
			fontSize: text.px14,
		},
		item: {
			borderRadius: radius.md,
			color: { default: 'var(--color-text)', ':hover': 'var(--color-text-strong)' },
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-hover)',
				':focus-visible': 'var(--color-hover)',
			},
		},
		checked: { color: 'var(--color-text-strong)' },
		rule: { backgroundColor: 'var(--color-line)' },
		away: { color: 'var(--color-text-muted)' },
	});
</script>

<DropdownMenu.Root>
	<!-- Pulled left by its padding, so the words stand where a plain title's would. -->
	<DropdownMenu.Trigger
		aria-label="{label}: {chosen?.title}"
		class="-ml-1.5 inline-flex h-8 cursor-pointer items-center gap-1 px-1.5 {stylex.attrs(
			type.heading,
			styles.trigger,
		).class}"
	>
		{chosen?.title}
		<Icon icon={ChevronDownIcon} size={16} class={stylex.attrs(styles.chevron).class} />
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			sideOffset={6}
			align="start"
			loop
			aria-label={label}
			class="z-40 flex min-w-44 flex-col p-1 {stylex.attrs(styles.menu).class}"
			{@attach arrive}
		>
			{#each options as one (one.key)}
				{@const here = one.key === value}
				<DropdownMenu.Item
					onSelect={() => (value = one.key)}
					class="flex h-8 cursor-pointer items-center justify-between gap-3 px-2 {stylex.attrs(
						styles.item,
						here && styles.checked,
					).class}"
				>
					{one.title}
					{#if here}<Icon icon={CheckIcon} size={16} stroke={2.5} />{/if}
				</DropdownMenu.Item>
			{/each}
			{#if links.length}
				<DropdownMenu.Separator class="mx-1 my-1 h-px {stylex.attrs(styles.rule).class}" />
				{#each links as one (one.href)}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a
								{...props}
								href={one.href}
								class="flex h-8 items-center justify-between gap-3 px-2 {stylex.attrs(styles.item)
									.class}"
							>
								{one.title}
								<Icon icon={ArrowUpRightIcon} size={16} class={stylex.attrs(styles.away).class} />
							</a>
						{/snippet}
					</DropdownMenu.Item>
				{/each}
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

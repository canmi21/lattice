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
	import { duration, radius } from '@canmi/kit/tokens/vocabulary.stylex';
	import ArrowUpRightIcon from '@tabler/icons-svelte-runes/icons/arrow-up-right';
	import CheckIcon from '@tabler/icons-svelte-runes/icons/check';
	import ChevronDownIcon from '@tabler/icons-svelte-runes/icons/chevron-down';
	import ChevronRightIcon from '@tabler/icons-svelte-runes/icons/chevron-right';
	import { DropdownMenu } from 'bits-ui';
	import Icon from '../design/icon.svelte';
	import type { IconComponent } from '../design/optics.ts';
	import { type Fold, fold, still } from '../design/motion.ts';
	import { type } from '../style.ts';
	import MenuContent from './menu-content.svelte';
	import MenuRow from './menu-row.svelte';

	/** An option: its key, the title it gives the card, its words in the menu, and its mark. */
	type Option = { key: Key; title: string; label: string; icon?: IconComponent };

	let {
		groups,
		value = $bindable(),
		label,
		links = [],
	}: {
		/**
		 * The options in groups a unit each, one open at a time: a group's head opens it in place
		 * and chooses nothing. One key may stand in two groups, said in each one's unit.
		 */
		groups: readonly { name: string; options: readonly Option[] }[];
		value: Key;
		/** What the choice is of, for assistive technology: `How far back`. */
		label: string;
		/** Pages the card leads to, after the options: `View all`. */
		links?: readonly { title: string; href: string }[];
	} = $props();

	/** The group the choice was made in, which says it; the first holding it until one is made. */
	let from: string | undefined = $state();
	const home = $derived(
		groups.find((group) => group.name === from && group.options.some((one) => one.key === value)) ??
			groups.find((group) => group.options.some((one) => one.key === value)) ??
			groups[0],
	);
	const chosen = $derived(home?.options.find((one) => one.key === value));
	/** One group alone is a plain list: no head to open it, and no column for a head's chevron. */
	const lone = $derived(groups.length === 1);
	/** Whether the options carry marks, which take the left column a head's chevron would. */
	const marked = $derived(groups.some((group) => group.options.some((one) => one.icon)));
	/** The group open in the menu: the chosen one's, each time the menu opens. */
	let menu = $state(false);
	let opened: string | undefined = $state();
	$effect(() => {
		if (menu) opened = home?.name;
	});
	/** Each group's options, folded to nothing where the group is closed. */
	const folds: (HTMLElement | undefined)[] = $state([]);
	/** The group each fold last stood for, so a fold first met is set and a change is carried. */
	const stood = new WeakMap<HTMLElement, boolean>();
	let content: HTMLElement | null = $state(null);
	$effect(() => {
		const first: Fold[] = [];
		const changed: Fold[] = [];
		groups.forEach((group, at) => {
			const node = folds[at];
			if (!node) return;
			const open = group.name === opened;
			const was = stood.get(node);
			if (was === open) return;
			(was === undefined ? first : changed).push({ node, open });
			stood.set(node, open);
		});
		fold(first, true);
		fold(changed);
	});

	const styles = stylex.create({
		trigger: {
			borderRadius: radius.md,
			backgroundColor: { default: 'transparent', ':hover': 'var(--color-selected)' },
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		chevron: { color: 'var(--color-text-muted)' },
	});
</script>

<DropdownMenu.Root bind:open={menu}>
	<!-- Pulled left by its padding, so the words stand where a plain title's would; as far from
	     the wash on every side, the chevron's own margin counted as part of its side's. -->
	<DropdownMenu.Trigger
		aria-label="{label}: {chosen?.title}"
		class="-ml-2 inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 pr-1 pl-2 whitespace-nowrap {stylex.attrs(
			type.heading,
			styles.trigger,
		).class}"
	>
		{chosen?.title}
		<Icon icon={ChevronDownIcon} size={16} class={stylex.attrs(styles.chevron).class} />
	</DropdownMenu.Trigger>
	<!-- Its options' words under the title's, the menu as wide as the title and as the longest
	     of them needs. -->
	<MenuContent {label} alignOffset={-4} bind:ref={content}>
		{#each groups as group, at (group.name)}
			{@const open = group.name === opened}
			<!-- A head opens its group in place and closes the one open; it chooses nothing. A lone
			     group has no head, its options the whole menu. -->
			{#if !lone}
				<MenuRow
					keep
					quiet
					expanded={open}
					lead={open ? ChevronDownIcon : ChevronRightIcon}
					onselect={() => {
						if (opened === group.name) return;
						if (content) still(content);
						opened = group.name;
					}}>{group.name}</MenuRow
				>
			{/if}
			<!-- Every group's options stand in the menu, a closed group's folded to nothing and out of
			     the keys' reach, so opening one is carried rather than cut. -->
			<div bind:this={folds[at]} class="flex shrink-0 flex-col overflow-hidden">
				{#each group.options as one (one.key)}
					{@const here = one.key === value && group.name === home?.name}
					<MenuRow
						disabled={!open}
						marks={!lone || marked}
						lead={one.icon}
						trail={here ? CheckIcon : undefined}
						current={here}
						onselect={() => {
							value = one.key;
							from = group.name;
						}}>{one.label}</MenuRow
					>
				{/each}
			</div>
		{/each}
		{#each links as one, index (one.href)}
			<MenuRow href={one.href} marks={!lone || marked} ruled={index === 0} trail={ArrowUpRightIcon}
				>{one.title}</MenuRow
			>
		{/each}
	</MenuContent>
</DropdownMenu.Root>

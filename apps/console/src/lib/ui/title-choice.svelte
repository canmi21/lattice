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
	import ChevronRightIcon from '@tabler/icons-svelte-runes/icons/chevron-right';
	import { DropdownMenu } from 'bits-ui';
	import Icon from '../design/icon.svelte';
	import { type Fold, fold, still, unfold } from '../design/motion.ts';
	import { type } from '../style.ts';

	/** An option: its key, the title it gives the card, and its words in the menu. */
	type Option = { key: Key; title: string; label: string };

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
		menu: {
			backgroundColor: 'var(--color-surface)',
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: radius.lg,
			boxShadow: '0 4px 12px rgb(0 0 0 / 0.25), 0 1px 3px rgb(0 0 0 / 0.2)',
			fontSize: text.px13,
			/** Scrolled where the window is too short, without a bar drawn over its rows. */
			scrollbarWidth: 'none',
		},
		/** A row the menu's width, edge to edge, its wash cut only by the menu's own corners. */
		item: {
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-selected)',
				':focus-visible': 'var(--color-selected)',
			},
		},
		/** A group's head, its unit, a step quieter than the options it holds. */
		head: { color: 'var(--color-text-muted)' },
		rule: { backgroundColor: 'var(--color-line)' },
		away: { color: 'var(--color-text-muted)' },
	});
</script>

<!-- A rule drawn, not laid out: no height and no gap of its own, so the menu is as tall with it
     as without. -->
{#snippet rule()}
	<span
		aria-hidden="true"
		class="absolute inset-x-0 -top-[0.5px] h-px {stylex.attrs(styles.rule).class}"
	></span>
{/snippet}

<!-- A column on each side of every row, a mark in it or none, so every row's words start and end
     at one edge: a head's chevron on the left; the check, a link's arrow on the right. A mark
     needs less room than words, so it stands nearer the edge and the words than they would. -->
{#snippet mark(icon?: typeof CheckIcon, quiet = true)}
	<span
		aria-hidden="true"
		class="flex w-3.5 shrink-0 justify-center {quiet ? stylex.attrs(styles.away).class : ''}"
	>
		{#if icon}<Icon {icon} size={14} />{/if}
	</span>
{/snippet}

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
	<DropdownMenu.Portal>
		<!-- Its options' words under the title's, the menu as wide as the title and as the longest
		     of them needs. -->
		<DropdownMenu.Content
			sideOffset={6}
			align="start"
			alignOffset={-4}
			loop
			aria-label={label}
			bind:ref={content}
			class="z-40 flex max-h-(--bits-floating-available-height) w-max min-w-(--bits-floating-anchor-width) flex-col overflow-y-auto {stylex.attrs(
				styles.menu,
			).class}"
			{@attach unfold}
		>
			{#each groups as group, at (group.name)}
				{@const open = group.name === opened}
				<!-- A head opens its group in place and closes the one open; it chooses nothing. A lone
				     group has no head, its options the whole menu. -->
				{#if !lone}<DropdownMenu.Item
						closeOnSelect={false}
						onSelect={() => {
							if (opened === group.name) return;
							if (content) still(content);
							opened = group.name;
						}}
						aria-expanded={open}
						class="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2 {stylex.attrs(
							styles.item,
							styles.head,
						).class}"
					>
						{@render mark(open ? ChevronDownIcon : ChevronRightIcon)}
						<span class="flex-1">{group.name}</span>
						{@render mark()}
					</DropdownMenu.Item>{/if}
				<!-- Every group's options stand in the menu, a closed group's folded to nothing and out of
				     the keys' reach, so opening one is carried rather than cut. -->
				<div bind:this={folds[at]} class="flex shrink-0 flex-col overflow-hidden">
					{#each group.options as one (one.key)}
						{@const here = one.key === value && group.name === home?.name}
						<DropdownMenu.Item
							disabled={!open}
							onSelect={() => {
								value = one.key;
								from = group.name;
							}}
							class="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2 {stylex.attrs(
								styles.item,
							).class}"
						>
							{#if !lone}{@render mark()}{/if}
							<span class="flex-1">{one.label}</span>
							{@render mark(here ? CheckIcon : undefined, false)}
						</DropdownMenu.Item>
					{/each}
				</div>
			{/each}
			{#if links.length}
				{#each links as one, index (one.href)}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a
								{...props}
								href={one.href}
								class="relative flex h-7 shrink-0 items-center gap-1.5 px-2 {stylex.attrs(
									styles.item,
								).class}"
							>
								{#if index === 0}{@render rule()}{/if}
								{#if !lone}{@render mark()}{/if}
								<span class="flex-1">{one.title}</span>
								{@render mark(ArrowUpRightIcon)}
							</a>
						{/snippet}
					</DropdownMenu.Item>
				{/each}
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

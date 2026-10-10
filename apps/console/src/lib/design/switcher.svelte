<script lang="ts">
	/**
	 * The view being read, at the top bar's left, and a menu of every view: each a link to the same
	 * section in that view, or to its overview where it has no such section. The menu's keys, focus
	 * and dismissal are Bits UI's, its panel and rows every menu's, ../ui/menu-content.svelte and
	 * ../ui/menu-row.svelte; see spec/console/design.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import CheckIcon from '@tabler/icons-svelte-runes/icons/check';
	import CaretUpDownIcon from '@tabler/icons-svelte-runes/icons/selector';
	import { DropdownMenu } from 'bits-ui';
	import { hrefIn, type Section } from '../sections.ts';
	import Icon from './icon.svelte';
	import { VIEW_GLYPHS } from '../scope/glyphs.ts';
	import { VIEWS, type View, labelOf } from '../scope/scope.ts';
	import MenuContent from '../ui/menu-content.svelte';
	import MenuRow from '../ui/menu-row.svelte';

	let { view, section }: { view: View; section: Section | undefined } = $props();

	const styles = stylex.create({
		trigger: {
			borderRadius: radius.md,
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-selected)',
			},
			color: 'var(--color-text-strong)',
			fontSize: text.px14,
			fontWeight: weight.medium,
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		chevron: { color: 'var(--color-text-muted)' },
	});
</script>

<DropdownMenu.Root>
	<!-- Pulled left by its padding, so the name lines up with the page below. -->
	<DropdownMenu.Trigger
		aria-label="View: {labelOf(view)}"
		class="-ml-2 inline-flex h-7 cursor-pointer items-center gap-1 pr-1 pl-2 {stylex.attrs(
			styles.trigger,
		).class}"
	>
		{labelOf(view)}
		<Icon icon={CaretUpDownIcon} size={16} class={stylex.attrs(styles.chevron).class} />
	</DropdownMenu.Trigger>
	<MenuContent label="Views" class="min-w-44">
		{#each VIEWS as one (one.key)}
			{@const here = one.key === view}
			<MenuRow
				href={hrefIn(one.key, section)}
				lead={VIEW_GLYPHS[one.key]}
				trail={here ? CheckIcon : undefined}
				current={here}>{one.label}</MenuRow
			>
		{/each}
	</MenuContent>
</DropdownMenu.Root>

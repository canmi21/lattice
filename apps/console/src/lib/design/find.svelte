<script lang="ts">
	/**
	 * The way into finding anything in the console, at the sidebar's head: drawn as a field, with
	 * its shortcut beside the word. What it opens waits on the search the site's palette is drawn
	 * from; see spec/console/design.md, "The sidebar's head is the way in to finding".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, family, radius, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import SearchIcon from '@tabler/icons-svelte-runes/icons/search';
	import Icon from './icon.svelte';

	const styles = stylex.create({
		field: {
			borderRadius: radius.md,
			backgroundColor: { default: 'var(--color-surface)', ':hover': 'var(--color-raised)' },
			boxShadow: `0 0 0 ${border.hairlinePx} var(--color-line)`,
			color: 'var(--color-text-muted)',
			fontSize: text.px13,
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		key: {
			borderRadius: radius.sm,
			boxShadow: `0 0 0 ${border.hairlinePx} var(--color-line)`,
			fontFamily: family.monoTheme,
			fontSize: text.px12,
			color: 'var(--color-text-muted)',
		},
	});
</script>

<button
	type="button"
	aria-label="Find"
	aria-keyshortcuts="Meta+K Control+K"
	class="flex h-8 w-full cursor-pointer items-center gap-2 px-3 text-left {stylex.attrs(
		styles.field,
	).class}"
>
	<Icon icon={SearchIcon} size={16} class="mx-px" />
	<span class="min-w-0 flex-1 truncate">Find…</span>
	<kbd class="px-1.5 leading-5 {stylex.attrs(styles.key).class}">⌘K</kbd>
</button>

<script lang="ts">
	/**
	 * The name of a line that stands for several apps sharing it -- apk and apt, both Package
	 * Updates -- as a place's nodes share one line of the place list: the name, how many it holds as
	 * `+2`, and on a press a menu of them, each leading to its own page. See
	 * spec/console/overview.md, "A line is any of three things, or the worst of them".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { DropdownMenu } from 'bits-ui';
	import { glyphOf } from '../apps/glyphs.ts';
	import MenuContent from '../ui/menu-content.svelte';
	import MenuRow from '../ui/menu-row.svelte';
	import type { Snippet } from 'svelte';

	let {
		apps,
		hrefOf,
		children,
	}: {
		apps: readonly string[];
		hrefOf: (app: string) => string;
		/** The line's label as it is drawn, its mark and name. */
		children: Snippet;
	} = $props();

	const styles = stylex.create({
		count: { color: 'var(--color-text-muted)', fontSize: text.px12 },
	});
</script>

<DropdownMenu.Root>
	<!-- The name and how many share it a half step apart, as a mark and its words are. -->
	<DropdownMenu.Trigger class="flex min-w-0 cursor-pointer items-center gap-1 text-left">
		<span class="flex min-w-0 items-center gap-2.5">{@render children()}</span>
		<span class="shrink-0 {stylex.attrs(styles.count).class}">+{apps.length}</span>
	</DropdownMenu.Trigger>
	<MenuContent label="Apps named so" alignOffset={-8} class="min-w-40">
		{#each apps as app (app)}
			<MenuRow href={hrefOf(app)} lead={glyphOf(app)}>{app}</MenuRow>
		{/each}
	</MenuContent>
</DropdownMenu.Root>

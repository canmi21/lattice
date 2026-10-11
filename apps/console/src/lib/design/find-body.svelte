<script lang="ts">
	/**
	 * What finding is, whichever surface holds it: a field over the view's pages, nodes and apps,
	 * found as one types, moved through with the arrows and opened with Enter, under headings, with
	 * the keys at the foot. Its cursor is @canmi/kit's behavior; what it finds is ./finding.ts. The
	 * sidebar's field opens it in place, ./find.svelte, and the shortcut in a palette over the page,
	 * ./palette.svelte. See spec/console/design.md, "The sidebar's head is the way in to finding".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, radius, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { ListCursor, reveal } from '@canmi/kit/behavior/cursor';
	import PackageIcon from '@tabler/icons-svelte-runes/icons/package';
	import SearchIcon from '@tabler/icons-svelte-runes/icons/search';
	import { goto } from '$app/navigation';
	import { live as liveOf } from '../live.svelte.ts';
	import Flag from '../map/flag.svelte';
	import { currentView } from '../scope/context.ts';
	import { SECTIONS } from '../sections.ts';
	import { type } from '../style.ts';
	import { type Found, type Kind, find, findable } from './finding.ts';
	import Icon from '@canmi/design/components/icon.svelte';

	let {
		open,
		close,
		name,
		query = $bindable(''),
		grown = true,
	}: {
		/** Whether the surface holding it is open: it focuses its field then, and empties after. */
		open: boolean;
		/** What closes the surface holding it, once a row is opened. */
		close: () => void;
		/** Told apart from the other surface's, for the list's and the rows' ids. */
		name: string;
		/** What is typed, for the surface to grow on. */
		query?: string;
		/** The list and the keys shown; the field alone, the sidebar's field's size, until then. */
		grown?: boolean;
	} = $props();

	const live = liveOf();
	const view = currentView();
	const cursor = new ListCursor();

	let input: HTMLInputElement | undefined = $state();
	let list: HTMLElement | undefined = $state();

	const found = $derived(find(findable(view(), live.view.nodes), query));
	/** The rows under their headings, in the order the keyboard walks them. */
	const HEADINGS: Record<Kind, string> = { page: 'Pages', node: 'Nodes', app: 'Apps' };
	const groups = $derived(
		(['page', 'node', 'app'] as const)
			.map((kind) => ({ kind, rows: found.filter((one) => one.kind === kind) }))
			.filter((group) => group.rows.length),
	);
	const rows = $derived(groups.flatMap((group) => group.rows));
	const aria = $derived(
		cursor.combobox({ list: `${name}-list`, option: (index) => `${name}-option-${index}` }),
	);

	$effect(() => {
		cursor.count = rows.length;
	});
	$effect(() => {
		if (list && open) reveal(list, cursor.active);
	});
	// Focus once bits-ui has settled the surface, not on the same tick.
	$effect(() => {
		if (open && input) input.focus();
	});

	const iconOf = (path: string) => SECTIONS.find((one) => `page ${one.path}` === path)?.icon;

	function choose(index: number) {
		const one = rows[index];
		if (!one) return;
		close();
		void goto(one.href);
	}

	// Emptied as the surface closes, so it opens on everything again.
	$effect(() => {
		if (open) return;
		query = '';
		cursor.active = 0;
	});

	const styles = stylex.create({
		field: {
			borderBottomWidth: border.hairlinePx,
			borderBottomStyle: 'solid',
			borderBottomColor: 'var(--color-line)',
			color: 'var(--color-text-muted)',
		},
		query: {
			backgroundColor: 'transparent',
			fontSize: text.px14,
			color: 'var(--color-text-strong)',
			outlineStyle: 'none',
			'::placeholder': { color: 'var(--color-text-muted)' },
		},
		/** The field before it grows, in the sidebar field's own size. */
		small: { fontSize: text.px13 },
		heading: { fontSize: text.px12, color: 'var(--color-text-muted)' },
		row: {
			borderRadius: radius.md,
			fontSize: text.px13,
			color: 'var(--color-text)',
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		active: { backgroundColor: 'var(--color-selected)', color: 'var(--color-text-strong)' },
		icon: { color: 'var(--color-text-muted)' },
		empty: { fontSize: text.px13, color: 'var(--color-text-muted)' },
		footer: {
			borderTopWidth: border.hairlinePx,
			borderTopStyle: 'solid',
			borderTopColor: 'var(--color-line)',
			fontSize: text.px12,
			color: 'var(--color-text-muted)',
		},
		key: {
			borderRadius: radius.sm,
			boxShadow: `0 0 0 ${border.hairlinePx} var(--color-line)`,
			fontSize: text.px12,
		},
	});
</script>

{#snippet key(word: string)}
	<kbd
		class="inline-flex min-w-5 justify-center px-1 leading-5 {stylex.attrs(type.shell, styles.key)
			.class}">{word}</kbd
	>
{/snippet}

<!-- Before it grows, the field is the sidebar's made live: its height, its gutter, its type. -->
<div
	class="flex shrink-0 items-center {grown ? 'gap-2.5 px-4' : 'gap-2 px-3'} {stylex.attrs(
		grown && styles.field,
	).class}"
>
	<Icon icon={SearchIcon} size={16} class={grown ? '' : 'mx-px'} />
	<input
		bind:this={input}
		bind:value={query}
		onkeydown={(event) => cursor.key(event, choose)}
		oninput={() => (cursor.active = 0)}
		type="text"
		autocomplete="off"
		spellcheck="false"
		placeholder={grown ? 'Find a page, a node or an app…' : 'Find…'}
		aria-label="Find"
		{...aria.input}
		class="{grown ? 'h-12' : 'h-8'} min-w-0 flex-1 {stylex.attrs(
			styles.query,
			!grown && styles.small,
		).class}"
	/>
</div>
{#if grown}
	<div bind:this={list} class="min-h-0 flex-1 overflow-y-auto p-1.5" {...aria.list}>
		{#each groups as group (group.kind)}
			<p class="px-2.5 pt-2 pb-1 {stylex.attrs(styles.heading).class}">
				{HEADINGS[group.kind]}
			</p>
			{#each group.rows as one (one.key)}
				{@const index = rows.indexOf(one)}
				{@const icon = iconOf(one.key)}
				<!-- The pointer moves the cursor as the arrows do, so one row is lit, not two. -->
				<div
					{...aria.option(index)}
					class="flex h-8 cursor-pointer items-center gap-2.5 px-2.5 {stylex.attrs(
						styles.row,
						index === cursor.active && styles.active,
					).class}"
					onpointermove={() => cursor.point(index)}
					onclick={() => choose(index)}
					onkeydown={() => {}}
				>
					<span class="inline-flex size-4 shrink-0 items-center justify-center">
						{#if one.kind === 'node' && one.code}
							<Flag code={one.code} size={14} />
						{:else}
							<span class={stylex.attrs(styles.icon).class}>
								<Icon icon={icon ?? PackageIcon} size={16} />
							</span>
						{/if}
					</span>
					<span class="truncate">{one.label}</span>
				</div>
			{/each}
		{:else}
			<p class="py-8 text-center {stylex.attrs(styles.empty).class}">Nothing is called that</p>
		{/each}
	</div>
	<div class="flex shrink-0 items-center gap-4 px-4 py-2 {stylex.attrs(styles.footer).class}">
		<span class="flex items-center gap-1.5">{@render key('↑')}{@render key('↓')} to move</span>
		<span class="flex items-center gap-1.5">{@render key('↵')} to open</span>
		<span class="flex items-center gap-1.5">{@render key('esc')} to close</span>
	</div>
{/if}

<script lang="ts" generics="Row">
	/**
	 * Rows under typed columns: searched from one box above them, sorted by a header, paged, each
	 * row a link where it has one. The server renders the first page whole, unsorted unless `sort`
	 * says otherwise; everything after is the browser's, over rows it already holds. Cells never
	 * wrap, so a wide table scrolls across inside its card. Under `height` it scrolls down inside
	 * itself too and its header sticks.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, radius, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import CaretDownIcon from '@tabler/icons-svelte-runes/icons/chevron-down';
	import CaretLeftIcon from '@tabler/icons-svelte-runes/icons/chevron-left';
	import CaretRightIcon from '@tabler/icons-svelte-runes/icons/chevron-right';
	import CaretUpIcon from '@tabler/icons-svelte-runes/icons/chevron-up';
	import CaretUpDownIcon from '@tabler/icons-svelte-runes/icons/selector';
	import MagnifyingGlassIcon from '@tabler/icons-svelte-runes/icons/search';
	import { untrack } from 'svelte';
	import { surfaces, type } from '../style.ts';
	import { filterRows, pageOf, sortRows, written, type Column, type Sort } from './table.ts';

	let {
		rows,
		columns,
		key,
		href,
		label,
		sort: initial,
		size = 25,
		filterable = true,
		height,
		empty = 'Nothing here yet',
		stale = false,
	}: {
		rows: Row[];
		columns: Column<Row>[];
		key: (row: Row) => string;
		/** Where a row leads; the first cell carries the link and the whole row answers it. */
		href?: (row: Row) => string | undefined;
		/** What the table holds, for a reader who does not see it. */
		label: string;
		sort?: Sort;
		size?: number;
		/** Whether the search box shows above the table. */
		filterable?: boolean;
		/** The most it grows to in pixels before scrolling inside itself. */
		height?: number;
		empty?: string;
		stale?: boolean;
	} = $props();

	let sort: Sort | undefined = $state(untrack(() => initial));
	let page = $state(1);
	let query = $state('');

	const filtered = $derived(filterRows(rows, columns, query));
	const shown = $derived(pageOf(sortRows(filtered, columns, sort), page, size));

	function order(column: Column<Row>) {
		sort =
			sort?.key !== column.key
				? { key: column.key, direction: column.kind === 'number' ? 'descending' : 'ascending' }
				: {
						key: column.key,
						direction: sort.direction === 'ascending' ? 'descending' : 'ascending',
					};
	}

	function ask(asked: string) {
		query = asked;
		page = 1;
	}

	const styles = stylex.create({
		frame: { backgroundColor: 'var(--color-surface)' },
		head: {
			backgroundColor: 'var(--color-surface)',
			boxShadow: '0 1px 0 var(--color-line)',
		},
		heading: {
			backgroundColor: 'transparent',
			borderWidth: 0,
			padding: 0,
			color: { default: 'inherit', ':hover': 'var(--color-text)' },
			font: 'inherit',
		},
		search: {
			backgroundColor: 'var(--color-ground)',
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: { default: 'var(--color-line)', ':focus': 'var(--color-line-strong)' },
			borderRadius: radius.md,
			color: 'var(--color-text)',
			fontSize: text.px13,
			outline: 'none',
			'::placeholder': { color: 'var(--color-text-faint)' },
		},
		row: {
			backgroundColor: {
				default: 'transparent',
				':hover': 'color-mix(in srgb, var(--color-raised) 40%, transparent)',
			},
		},
		icon: { color: 'var(--color-text-faint)' },
		link: { color: 'var(--color-text-strong)' },
		control: {
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-raised)',
				':disabled': 'transparent',
			},
			borderWidth: 0,
			borderRadius: radius.md,
			color: {
				default: 'var(--color-text-muted)',
				':hover': 'var(--color-text-strong)',
				':disabled': 'var(--color-text-faint)',
			},
		},
		stale: { opacity: 0.5 },
	});
</script>

<div class="flex min-w-0 flex-col">
	{#if filterable}
		<div class="px-5 py-3">
			<label class="relative block w-full max-w-xs">
				<MagnifyingGlassIcon
					size={16}
					class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 {stylex.attrs(
						styles.icon,
					).class}"
				/>
				<input
					type="search"
					aria-label="Search {label.toLowerCase()}"
					placeholder="Search"
					class="h-8 w-full pr-2.5 pl-8 {stylex.attrs(styles.search).class}"
					value={query}
					oninput={(event) => ask(event.currentTarget.value)}
				/>
			</label>
		</div>
	{/if}
	<div
		class="min-w-0 overflow-x-auto {height ? 'overflow-y-auto' : ''} {stylex.attrs(styles.frame)
			.class}"
		style:max-height={height ? `${height}px` : undefined}
	>
		<table aria-busy={stale} class={stylex.attrs(stale && styles.stale).class}>
			<caption class="sr-only">{label}</caption>
			<thead class="sticky top-0 z-10 {stylex.attrs(styles.head).class}">
				<tr>
					{#each columns as column (column.key)}
						{@const sorted = sort?.key === column.key ? sort.direction : undefined}
						<th
							scope="col"
							aria-sort={sorted ?? 'none'}
							class="border-b-0 {column.kind === 'number' ? 'text-right' : ''}"
						>
							{#if column.sortable ?? true}
								<button
									type="button"
									class="group inline-flex items-center gap-1 {column.kind === 'number'
										? 'flex-row-reverse'
										: ''} {stylex.attrs(styles.heading).class}"
									onclick={() => order(column)}
								>
									{column.label}
									{#if sorted === 'ascending'}<CaretUpIcon
											size={14}
											stroke={2.5}
										/>{:else if sorted === 'descending'}<CaretDownIcon
											size={14}
											stroke={2.5}
										/>{:else}<CaretUpDownIcon
											size={14}
											stroke={2.5}
											class="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
										/>{/if}
								</button>
							{:else}
								{column.label}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each shown.rows as row (key(row))}
					{@const link = href?.(row)}
					<tr class="h-11 {link ? 'relative cursor-pointer' : ''} {stylex.attrs(styles.row).class}">
						{#each columns as column, index (column.key)}
							<td
								class="whitespace-nowrap {column.kind === 'number'
									? 'text-right'
									: ''} {stylex.attrs(type.body).class}"
							>
								{#snippet content()}
									{#if column.cell}{@render column.cell(row)}{:else}{written(column, row)}{/if}
								{/snippet}
								{#if index === 0 && link}
									<a
										href={link}
										class="after:absolute after:inset-0 {stylex.attrs(styles.link).class}"
										>{@render content()}</a
									>
								{:else}
									{@render content()}
								{/if}
							</td>
						{/each}
					</tr>
				{:else}
					<tr>
						<td colspan={columns.length} class="py-10 text-center {stylex.attrs(type.soft).class}">
							{#if rows.length && query.trim()}
								No rows match the search.
								<button
									type="button"
									class="underline {stylex.attrs(styles.control).class}"
									onclick={() => ask('')}>Clear it</button
								>
							{:else}
								{empty}
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if shown.pages > 1}
		<footer
			class="flex items-center justify-between gap-3 py-1.5 pr-3 pl-5 whitespace-nowrap {stylex.attrs(
				surfaces.rowRule,
				type.soft,
			).class}"
		>
			<span>{shown.from}&ndash;{shown.to} of {filtered.length}</span>
			<div class="flex items-center gap-1">
				<button
					type="button"
					aria-label="Previous page"
					class="inline-flex size-7 items-center justify-center {stylex.attrs(styles.control)
						.class}"
					disabled={shown.page <= 1}
					onclick={() => (page = shown.page - 1)}><CaretLeftIcon size={18} /></button
				>
				<button
					type="button"
					aria-label="Next page"
					class="inline-flex size-7 items-center justify-center {stylex.attrs(styles.control)
						.class}"
					disabled={shown.page >= shown.pages}
					onclick={() => (page = shown.page + 1)}><CaretRightIcon size={18} /></button
				>
			</div>
		</footer>
	{/if}
</div>

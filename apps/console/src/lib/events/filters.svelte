<script lang="ts">
	/**
	 * The filters in one row, a plain GET form: submitting writes them into the URL and drops the
	 * cursor, so a filtered view is a link and survives a reload before anything hydrates.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, radius, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { scoped } from '../scope/context.ts';
	import { type } from '../style.ts';
	import { SIZES, type Query } from './query.ts';

	let {
		query,
		nodes,
		options,
	}: {
		query: Query;
		nodes: readonly string[];
		options: Record<'app' | 'action' | 'outcome' | 'stage', string[]>;
	} = $props();

	const { to } = scoped();

	const selects = $derived([
		{ name: 'node', label: 'Node', values: nodes },
		{ name: 'app', label: 'App', values: options.app },
		{ name: 'action', label: 'Action', values: options.action },
		{ name: 'outcome', label: 'Outcome', values: options.outcome },
		{ name: 'stage', label: 'Stage', values: options.stage },
	] as const);

	const styles = stylex.create({
		field: {
			backgroundColor: 'var(--color-sunken)',
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: { default: 'var(--color-line)', ':focus': 'var(--color-line-strong)' },
			borderRadius: radius.md,
			color: 'var(--color-text)',
			fontSize: text.px12,
		},
		clear: { color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' } },
	});
</script>

<form method="get" class="flex flex-wrap items-end gap-3" aria-label="Filter events">
	{#each selects as { name, label, values } (name)}
		<label class="flex flex-col gap-1 {stylex.attrs(type.label).class}">
			{label}
			<select
				{name}
				class="h-8 px-2 normal-case {stylex.attrs(styles.field).class}"
				value={query[name]}
				onchange={(event) => event.currentTarget.form?.requestSubmit()}
			>
				<option value="">All</option>
				{#each values as value (value)}<option {value}>{value}</option>{/each}
			</select>
		</label>
	{/each}
	<label class="flex min-w-48 flex-1 flex-col gap-1 {stylex.attrs(type.label).class}">
		Search detail
		<input
			type="search"
			name="q"
			value={query.q}
			placeholder="Text in the detail"
			class="h-8 px-2 normal-case {stylex.attrs(styles.field).class}"
		/>
	</label>
	<label class="flex flex-col gap-1 {stylex.attrs(type.label).class}">
		Rows
		<select
			name="size"
			class="h-8 px-2 normal-case {stylex.attrs(styles.field).class}"
			value={query.size}
			onchange={(event) => event.currentTarget.form?.requestSubmit()}
		>
			{#each SIZES as size (size)}<option value={size}>{size}</option>{/each}
		</select>
	</label>
	<button type="submit" class="h-8 px-3 {stylex.attrs(styles.field, type.body).class}">Apply</button
	>
	<a href={to('/events')} class="h-8 content-center {stylex.attrs(type.soft, styles.clear).class}"
		>Clear</a
	>
</form>

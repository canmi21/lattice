<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, family, radius, text } from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The visual half of a package list. Every colour is the token variable `libs/tokens` already
	 * declares. See spec/architecture/css/authoring.md.
	 *
	 * The row is the licence directory's row with a second column, its three declarations copied
	 * character for character rather than shared -- where a module for the shared constant should
	 * live is the question spec/todo/site.md is holding. See spec/architecture/css/authoring.md,
	 * "A comment in the module script cannot write a tag in angle brackets".
	 */
	const styles = stylex.create({
		/** One row of the list: a package, its version, and what it is licensed under. */
		row: {
			borderRadius: radius.lg,
			backgroundColor: {
				default: null,
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the fill from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-paper-hover)' },
			},
			// The ring belongs to the name inside, which `focus-link-inner` draws around the text
			// rather than around the full width of the row.
			outlineStyle: { default: null, ':focus-visible': 'none' },
		},
		/** The package's name, the loudest thing in the row. */
		name: {
			color: 'var(--color-text-strong)',
		},
		version: {
			fontFamily: family.monoTheme,
			fontSize: text.px13,
			color: 'var(--color-text-soft)',
		},
		/** The badge on a licence the package states about itself. */
		asserted: {
			borderRadius: radius.sm,
			// `border` writes its style through `--tw-border-style`, which is registered with
			// `solid` as its initial value, so the edge computes to one pixel of solid.
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: 'var(--color-border)',
			fontSize: text.px12,
			color: 'var(--color-text-soft)',
		},
		/** The expression, shown only where it differs from the licence this list is under. */
		spdx: {
			fontSize: text.px13,
			color: 'var(--color-text-soft)',
		},
	});
</script>

<script lang="ts">
	import * as m from '@canmi/messages';
	import type { LocaleCode } from '$lib/locale';
	import type { PackageRow } from './directory';

	let { rows, locale, license }: { rows: PackageRow[]; locale: LocaleCode; license?: string } =
		$props();
</script>

<div>
	{#each rows as entry (entry.purl)}
		<a
			href={entry.href}
			class="focus-ring-within -mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-2 py-1 {stylex.attrs(
				styles.row,
			).class}"
		>
			<span class="flex min-w-0 items-baseline gap-2">
				<span class="focus-link-inner min-w-0 truncate {stylex.attrs(styles.name).class}"
					>{entry.name}</span
				>
				<span class="shrink-0 {stylex.attrs(styles.version).class}">{entry.version}</span>
			</span>
			<span class="flex min-w-0 items-center gap-2">
				{#if entry.asserted}
					<span class="shrink-0 px-1 {stylex.attrs(styles.asserted).class}"
						>{m['licenses.asserted']({}, { locale })}</span
					>
				{/if}
				{#if entry.spdx !== license}
					<span class="max-w-56 truncate text-right {stylex.attrs(styles.spdx).class}"
						>{entry.spdx}</span
					>
				{/if}
			</span>
		</a>
	{/each}
</div>

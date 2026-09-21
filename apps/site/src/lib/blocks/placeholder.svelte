<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, family, leading, radius, text } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the placeholder a block falls back to. Every colour is the token
	 * variable `libs/tokens` already declares. See spec/architecture/css/authoring.md.
	 *
	 * The file keeps no scoped block: the box's padding and the step between metadata rows are
	 * layout, and stay in the markup where layout belongs. See spec/architecture/css/authoring.md, "A
	 * comment in the module script cannot write a tag in angle brackets".
	 */
	const styles = stylex.create({
		/** The dashed box. Its type is set once here and both rows inside it read down from it. */
		frame: {
			borderRadius: radius.xl,
			borderWidth: border.doublePx,
			borderStyle: 'dashed',
			borderColor: 'var(--color-border)',
			backgroundColor: 'var(--color-paper)',
			fontFamily: family.monoTheme,
			color: 'var(--color-text-soft)',
		},
		kind: {
			color: 'var(--color-text)',
		},
		/**
		 * A metadata row, one step down from the box's own size. The twelve-pixel step writes its
		 * line as `calc(1 / 0.75)`, the same 1rem, and it cannot be written as that ratio here.
		 */
		meta: {
			fontSize: text.px12,
			lineHeight: leading.px16,
		},
	});
</script>

<script lang="ts">
	type Props = {
		kind: string;
		meta?: Record<string, string | undefined>;
	};
	let { kind, meta }: Props = $props();
</script>

<div class="p-4 {stylex.attrs(surfaces.uiText, styles.frame).class}">
	<div class={stylex.attrs(styles.kind).class}>::{kind}</div>
	{#if meta}
		{#each Object.entries(meta) as [k, v]}
			{#if v !== undefined}
				<div class="mt-1 {stylex.attrs(styles.meta).class}">{k} = "{v}"</div>
			{/if}
		{/each}
	{/if}
</div>

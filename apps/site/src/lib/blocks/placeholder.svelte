<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, radius } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the placeholder a block falls back to. Every colour is the token
	 * variable `libs/tokens` already declares, so nothing here can change one. See
	 * spec/architecture/css.md.
	 *
	 * The file keeps no scoped block: what is left in the markup is the box's padding and the
	 * step between metadata rows, which is layout and is where layout belongs.
	 *
	 * Nothing in this block may write a tag in angle brackets, in a comment or anywhere else:
	 * oxfmt then deletes the whole instance script below, silently and with a zero exit status.
	 */
	const styles = stylex.create({
		/** The dashed box. Its type is set once here and both rows inside it read down from it. */
		frame: {
			borderRadius: radius.xl,
			borderWidth: border.doublePx,
			borderStyle: 'dashed',
			borderColor: 'var(--color-border)',
			backgroundColor: 'var(--color-paper)',
			fontFamily: 'var(--font-mono)',
			fontSize: '0.875rem',
			// The line as a length rather than as the ratio `text-sm` writes it, `calc(1.25 /
			// 0.875)`. StyleX evaluates a calc and keeps five decimals, and 1.42857 against 14px
			// lands at 19.99998 where the browser's own division lands on 20. See
			// spec/architecture/css.md.
			lineHeight: '1.25rem',
			color: 'var(--color-text-soft)',
		},
		kind: {
			color: 'var(--color-text)',
		},
		/**
		 * A metadata row, one step down from the box's own size. `text-xs` writes its line as
		 * `calc(1 / 0.75)`, which is the same 1rem and cannot be written as that ratio here.
		 */
		meta: {
			fontSize: '0.75rem',
			lineHeight: '1rem',
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

<div class="p-4 {stylex.attrs(styles.frame).class}">
	<div class={stylex.attrs(styles.kind).class}>::{kind}</div>
	{#if meta}
		{#each Object.entries(meta) as [k, v]}
			{#if v !== undefined}
				<div class="mt-1 {stylex.attrs(styles.meta).class}">{k} = "{v}"</div>
			{/if}
		{/each}
	{/if}
</div>

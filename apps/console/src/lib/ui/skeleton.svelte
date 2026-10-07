<script lang="ts">
	/**
	 * A card's content before its read lands: the height it will have, filled faintly and still, so
	 * nothing moves when the data comes. Under `chart`, the row a chart's frame keeps above its body
	 * is kept too; see ../chart/frame.svelte. See spec/architecture/console.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { radius } from '@canmi/kit/tokens/vocabulary.stylex';

	let {
		height,
		ratio,
		chart = false,
		label = 'Loading',
	}: {
		/** The body's height in pixels, as the content it stands for draws it. */
		height?: number;
		/** Or its width over its height, for content drawn to the card's width, as a map is. */
		ratio?: string;
		chart?: boolean;
		label?: string;
	} = $props();

	const styles = stylex.create({
		fill: {
			backgroundColor: 'color-mix(in srgb, var(--color-raised) 45%, transparent)',
			borderRadius: radius.lg,
		},
	});
</script>

<div class="flex min-w-0 flex-col gap-2" role="status" aria-busy="true" aria-label={label}>
	{#if chart}<div class="h-6"></div>{/if}
	<div
		class={stylex.attrs(styles.fill).class}
		style:height={height === undefined ? undefined : `${height}px`}
		style:aspect-ratio={ratio}
	></div>
</div>

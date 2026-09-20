<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';

	const styles = stylex.create({
		/**
		 * The line between two actions.
		 *
		 * As wide as the ring above it and no wider: it separates a pair of controls, so it is
		 * measured against them rather than against the bar, which has no width of its own to be
		 * measured against in the first place.
		 */
		rule: {
			backgroundColor: 'var(--color-border)',
		},
	});
</script>

<script lang="ts">
	import type { LocaleCode } from '$lib/locale';
	import ThemeToggle from '$lib/theme/toggle.svelte';
	import ReadingProgress from './reading-progress.svelte';

	/**
	 * The column down the right of an article, and the mirror of the rail down its left.
	 *
	 * The rail holds what an article is; this holds what a reader does with one. **It declares no
	 * width**: the rail declares 8.5rem because text needs a measure, and a control knows its own
	 * size. The article is centred at every width, so `--rail-left` and the rail's breakpoint serve
	 * both sides. See spec/styling/rail.md, "The article is centred; the rail adapts to the region
	 * beside it" and "Absent rather than squeezed".
	 */
	let { locale }: { locale: LocaleCode } = $props();
</script>

<!-- A full-height strip, inert, with its children taking their own events back -- the same
     arrangement the rail uses, and for the same reason: it spans the window so that what is in it
     can be centred, and a strip that caught clicks would swallow the page's right margin. -->
<div
	class="pointer-events-none fixed inset-y-0 right-[var(--rail-left)] z-10 hidden items-center min-[68rem]:flex"
>
	<div class="pointer-events-auto flex flex-col items-center gap-2">
		<ReadingProgress {locale} />
		<!-- Presentational, and the reader is told nothing by it that the arrangement does not
		     already say. -->
		<div class="h-px w-6 {stylex.attrs(styles.rule).class}" role="presentation"></div>
		<ThemeToggle {locale} />
	</div>
</div>

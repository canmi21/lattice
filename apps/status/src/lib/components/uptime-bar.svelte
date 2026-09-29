<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { duration, easing, figures, leading, text } from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The visual half of the bar. Every colour is a palette name, read rather than retyped; the
	 * accents mark state and nothing else. See spec/architecture/css/authoring.md.
	 */
	const styles = stylex.create({
		segment: {
			borderRadius: '0.125rem',
			transitionProperty: 'background-color',
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: easing.inOut,
		},
		up: { backgroundColor: 'var(--color-green)' },
		down: { backgroundColor: 'var(--color-red)' },
		// Some rounds failed: the failing colour, thinned, so it reads between the two.
		partial: { backgroundColor: 'color-mix(in oklch, var(--color-red) 45%, transparent)' },
		none: { backgroundColor: 'var(--color-border)' },
		scale: {
			color: 'var(--color-text-soft)',
			fontSize: text.px12,
			lineHeight: leading.px16,
			fontVariantNumeric: figures.tabular,
		},
	});
</script>

<script lang="ts">
	import type { Segment } from '$lib/board';
	import { segment as grow } from '$lib/motion';
	import { hourMinute, percent } from '$lib/time';

	let { segments, uptime, local }: { segments: Segment[]; uptime: number | null; local: boolean } =
		$props();

	// Segments that exist before the first frame are the first screen and do not grow in; one
	// created after it is the next half-hour opening. Read once, at creation, so not reactive.
	const first = { settled: false };
	$effect(() => {
		const frame = requestAnimationFrame(() => (first.settled = true));
		return () => cancelAnimationFrame(frame);
	});

	const label = $derived(
		uptime === null
			? 'No rounds recorded in the last 24 hours'
			: `Uptime over the last 24 hours: ${percent(uptime)}`,
	);

	// A reader's own clock, so only once the browser renders: the server's zone is nobody's.
	function title(segment: Segment): string | undefined {
		if (!local) return undefined;
		const asked = segment.passed + segment.failed;
		const range = hourMinute(segment.start);
		if (asked === 0) return `${range} · no rounds`;
		return `${range} · ${percent(segment.passed / asked)} of ${asked} rounds`;
	}
</script>

<div role="img" aria-label={label} class="flex h-7 gap-px sm:gap-0.5">
	{#each segments as segment (segment.start)}
		<span
			use:grow={{ state: segment.state, arrived: first.settled }}
			class="min-w-0 flex-1 {stylex.attrs(styles.segment, styles[segment.state]).class}"
			title={title(segment)}
		></span>
	{/each}
</div>
<div class="mt-2 flex justify-between {stylex.attrs(styles.scale).class}" aria-hidden="true">
	<span>24 h ago</span>
	<span>{uptime === null ? 'no data' : `${percent(uptime)} uptime`}</span>
	<span>now</span>
</div>

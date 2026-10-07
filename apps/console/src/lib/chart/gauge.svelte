<script lang="ts">
	/**
	 * A share at a glance: a small ring, or a slim bar, filled to it in one hue over a muted track,
	 * never a state's color; the short figure beside it, and the full sentence on hover
	 * and for a reader who does not see it. Plain SVG at a fixed size in pixels, so the server draws
	 * it whole. See spec/architecture/console.md, "A figure is drawn before it is written".
	 */
	let {
		share,
		label,
		figure,
		shape = 'ring',
		size = 16,
		color = 'var(--color-accent)',
	}: {
		/** From 0 to 1, drawn full past 1; unknown draws the track alone. */
		share: number | undefined;
		/** The whole sentence: `975.5 MiB of 23.4 GiB, 4.1%`. */
		label: string;
		/** What is written beside it: `4.1%`, `0.42`. */
		figure?: string;
		shape?: 'ring' | 'bar';
		/** A ring's width and height, or a bar's width, in pixels. */
		size?: number;
		color?: string;
	} = $props();

	const BAR = 4;

	const filled = $derived(
		share === undefined || !Number.isFinite(share) ? 0 : Math.min(1, Math.max(0, share)),
	);
	const TRACK = 'var(--color-line-strong)';
	/** A ring's stroke, thickening a little as the ring grows. */
	const stroke = $derived(Math.max(3, Math.round(size / 7)));
	const radius = $derived((size - stroke) / 2);
</script>

<!-- Positioned, so a row's link drawn over the whole row does not cover its title. -->
<span class="relative inline-flex items-center gap-1.5 align-middle" title={label}>
	{#if shape === 'ring'}
		<svg
			width={size}
			height={size}
			viewBox="0 0 {size} {size}"
			class="block shrink-0"
			role="img"
			aria-label={label}
		>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				style:stroke={TRACK}
				stroke-width={stroke}
			/>
			{#if filled > 0}
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					style:stroke={color}
					stroke-width={stroke}
					pathLength="100"
					stroke-dasharray="{filled * 100} 100"
					transform="rotate(-90 {size / 2} {size / 2})"
				/>
			{/if}
		</svg>
	{:else}
		<svg
			width={size}
			height={BAR}
			viewBox="0 0 {size} {BAR}"
			class="block shrink-0"
			role="img"
			aria-label={label}
		>
			<rect width={size} height={BAR} rx={BAR / 2} style:fill={TRACK} />
			{#if filled > 0}
				<rect width={Math.max(BAR, filled * size)} height={BAR} rx={BAR / 2} style:fill={color} />
			{/if}
		</svg>
	{/if}
	{#if figure !== undefined}<!-- As wide as `100%` at least, so the marks in a column line up. -->
		<span class="min-w-[4ch] text-right tabular-nums" aria-hidden="true">{figure}</span>{/if}
</span>

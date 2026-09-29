<script lang="ts">
	import type { Segment } from '$lib/board';
	import { hourMinute, percent } from '$lib/time';

	let { segments, uptime, local }: { segments: Segment[]; uptime: number | null; local: boolean } =
		$props();

	const TONE = {
		up: 'bg-green',
		down: 'bg-red',
		partial: 'bg-red/45',
		none: 'bg-border',
	} as const;

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
		<span class="min-w-0 flex-1 rounded-[1px] {TONE[segment.state]}" title={title(segment)}></span>
	{/each}
</div>
<div class="mt-1.5 flex justify-between text-xs text-text-soft" aria-hidden="true">
	<span>24 h ago</span>
	<span>{uptime === null ? 'no data' : `${percent(uptime)} uptime`}</span>
	<span>now</span>
</div>

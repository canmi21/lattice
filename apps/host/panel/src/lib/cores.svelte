<script lang="ts">
	/** Each core this second: how busy, and which cluster it runs in where there are several. */
	import * as stylex from '@stylexjs/stylex';
	import { type } from './style/surfaces';
	import { radius } from './style/vocabulary.stylex';

	let {
		usage,
		clusters,
	}: {
		usage: number[];
		/** The name of each core's cluster, where the machine has more than one kind. */
		clusters: (string | undefined)[];
	} = $props();

	function tone(share: number): string {
		return share > 90 ? 'var(--color-danger)' : share > 70 ? 'var(--color-warn)' : 'var(--nord8)';
	}

	const styles = stylex.create({
		tile: {
			backgroundColor: 'var(--color-sunken)',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: radius.lg,
		},
		track: { backgroundColor: 'var(--color-raised)', borderRadius: radius.full },
		fill: { borderRadius: radius.full, transitionProperty: 'width', transitionDuration: '400ms' },
	});
</script>

<div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
	{#each usage as share, core (core)}
		<div class="flex flex-col gap-2 p-3 {stylex.attrs(styles.tile).class}">
			<div class="flex items-baseline justify-between">
				<span class={stylex.attrs(type.label).class}>Core {core}</span>
				<span class={stylex.attrs(type.heading).class}>{share.toFixed(0)}%</span>
			</div>
			<div class="h-1 w-full overflow-hidden {stylex.attrs(styles.track).class}">
				<div
					class="h-full {stylex.attrs(styles.fill).class}"
					style:width="{Math.min(100, share)}%"
					style:background-color={tone(share)}
				></div>
			</div>
			{#if clusters[core]}
				<span class="truncate {stylex.attrs(type.muted).class}">{clusters[core]} cluster</span>
			{/if}
		</div>
	{/each}
</div>

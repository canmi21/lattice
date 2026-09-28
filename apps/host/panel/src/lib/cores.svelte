<script lang="ts">
	/** Each core this second: how busy, and how fast it runs against how fast it can. */
	import * as stylex from '@stylexjs/stylex';
	import { frequency } from './format';
	import { type } from './style/surfaces';
	import { radius } from './style/vocabulary.stylex';

	let {
		usage,
		frequencies,
		fastest,
	}: {
		usage: number[];
		/** MHz now, per core, where the machine says. */
		frequencies: (number | undefined)[];
		/** MHz at most, per core. */
		fastest: (number | null)[];
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
			<span class="truncate {stylex.attrs(type.muted).class}">
				{#if frequencies[core] !== undefined}
					{frequency(frequencies[core]!)}{#if fastest[core]}
						<span> of {frequency(fastest[core]!)}</span>{/if}
				{:else}
					No frequency reported
				{/if}
			</span>
		</div>
	{/each}
</div>

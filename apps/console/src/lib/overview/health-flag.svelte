<script lang="ts">
	/**
	 * A node's flag with how it is as a dot on its corner, ringed in the card's own ground as the
	 * account's avatar wears its presence: blue well, amber leaving, quiet waiting, red down or
	 * gone, and why on its hover. See spec/console/overview.md, "A flag's dot is how its node is".
	 */
	import * as stylex from '@stylexjs/stylex';
	import Flag from '../map/flag.svelte';
	import { tone } from '../style.ts';
	import type { Told } from './health.ts';

	let { code, told, size = 16 }: { code: string; told: Told; size?: number } = $props();

	const styles = stylex.create({
		well: { color: 'var(--color-primary)' },
		ring: { borderWidth: '1.5px', borderStyle: 'solid', borderColor: 'var(--color-surface)' },
	});
	const DOT = {
		well: styles.well,
		leaving: tone.warn,
		waiting: tone.quiet,
		down: tone.bad,
		gone: tone.bad,
	};
</script>

<span class="relative inline-flex shrink-0" title={told.said}>
	<Flag {code} {size} />
	<span
		aria-hidden="true"
		class="absolute -right-1 bottom-0 size-2 rounded-full bg-current {stylex.attrs(
			DOT[told.health],
			styles.ring,
		).class}"
	></span>
	<span class="sr-only">{told.said}</span>
</span>

<script lang="ts">
	/**
	 * How an app is rolled out, in a word, its code word and the nodes it holds on on hover. Not a
	 * state, so no icon and no tone: see ./rollout.ts.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { nodeLabel } from '../map/places.ts';
	import { surfaces, type, wash } from '../style.ts';
	import { rolloutLabel } from './rollout.ts';

	let { rollout, nodes }: { rollout: string; nodes?: readonly string[] } = $props();

	const title = $derived(
		nodes?.length
			? `rollout = "${rollout}" on ${nodes.map((node) => nodeLabel(node, 'lead')).join(', ')}`
			: `rollout = "${rollout}"`,
	);
</script>

<span
	{title}
	class="inline-flex h-5.5 items-center px-2 whitespace-nowrap {stylex.attrs(
		surfaces.pill,
		type.soft,
		wash.quiet,
	).class}">{rolloutLabel(rollout)}</span
>

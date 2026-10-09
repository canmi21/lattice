<script lang="ts">
	/**
	 * Every node beside the map, a line each: a dot for whether it is heard, its place, its code,
	 * and the figure the switch above the list picks -- how busy its processor is, how much of its
	 * memory is in use, or how many apps it runs. Pointing at a line points the map at its node, and
	 * a line is a link to the node. See spec/console/overview.md, "The map is the page's whole
	 * picture".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Live } from '../live.svelte.ts';
	import { nameOf } from '../map/places.ts';
	import { liveness, readings, running } from '../node.ts';
	import { CODES } from '../nodes/facts.ts';
	import { scoped } from '../scope/context.ts';
	import { tone, type } from '../style.ts';
	import Segmented from '../ui/segmented.svelte';

	let {
		live,
		pointed = $bindable(),
	}: {
		live: Live;
		/** The node a line is pointed at, which the map opens. */
		pointed?: string;
	} = $props();

	const { node: toNode } = scoped();

	const FIGURES = [
		{ key: 'cpu', label: 'CPU' },
		{ key: 'memory', label: 'Memory' },
		{ key: 'apps', label: 'Apps' },
	] as const;
	let figure = $state<(typeof FIGURES)[number]['key']>('cpu');

	/** One decimal always, so the column's figures line up. */
	const share = (part: number) => `${(part * 100).toFixed(1)}%`;

	const rows = $derived(
		CODES.map((code) => {
			const held = live.view.nodes[code];
			const read = readings(held?.snapshot.machine);
			const heard = held ? liveness(held.heard_at, live.now) !== 'gone' : false;
			const memory = read?.memory?.total ? read.memory.used / read.memory.total : undefined;
			const apps = held ? running(held) : undefined;
			const value =
				figure === 'cpu'
					? read?.cpu === undefined
						? undefined
						: share(read.cpu / 100)
					: figure === 'memory'
						? memory === undefined
							? undefined
							: share(memory)
						: apps && `${apps.running} of ${apps.total}`;
			return { code, name: nameOf(code).full, heard, value };
		}),
	);

	const styles = stylex.create({
		row: {
			backgroundColor: {
				default: 'transparent',
				':hover': 'color-mix(in srgb, var(--color-raised) 55%, transparent)',
			},
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		/** A heard node's dot in the map's own blue, so a line and its mark read as one. */
		heard: { color: 'var(--color-primary)' },
		code: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		value: {
			color: 'var(--color-text)',
			fontSize: text.px13,
			fontVariantNumeric: 'tabular-nums',
		},
	});
</script>

<div class="flex flex-col items-start gap-3">
	<Segmented options={FIGURES} bind:value={figure} label="What each node shows" />
	<ul class="-mx-2 flex flex-col self-stretch" aria-label="Nodes">
		{#each rows as row (row.code)}
			<li>
				<a
					href={toNode(row.code)}
					class="grid h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 {stylex.attrs(
						styles.row,
					).class}"
					onpointerenter={() => (pointed = row.code)}
					onpointerleave={() => (pointed = undefined)}
					onfocus={() => (pointed = row.code)}
					onblur={() => (pointed = undefined)}
				>
					<span
						aria-hidden="true"
						class="size-1.5 rounded-full bg-current {stylex.attrs(
							row.heard ? styles.heard : tone.bad,
						).class}"
					></span>
					<span class="flex min-w-0 items-baseline gap-2 {stylex.attrs(type.body).class}">
						<span class="truncate">{row.name}</span>
						<span class={stylex.attrs(type.mono, styles.code).class}>{row.code}</span>
					</span>
					<span class={stylex.attrs(styles.value).class}>{row.value ?? '–'}</span>
				</a>
			</li>
		{/each}
	</ul>
</div>

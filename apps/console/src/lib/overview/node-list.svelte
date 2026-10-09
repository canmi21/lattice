<script lang="ts">
	/**
	 * Every place beside the map, a line each under two quiet headings: a dot for whether its nodes
	 * are heard, its name whole, how many nodes stand there where it is more than one, and how busy
	 * its processors are. The rest of a place -- its memory, its apps, each node by code -- is the
	 * map's card, which pointing at a line opens. A node's line links to it, a shared place's to the
	 * nodes. See spec/console/overview.md, "The map is the page's whole picture".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Live } from '../live.svelte.ts';
	import { nameOf } from '../map/places.ts';
	import { liveness, readings } from '../node.ts';
	import { CODES } from '../nodes/facts.ts';
	import { scoped } from '../scope/context.ts';
	import { tone, type } from '../style.ts';

	let {
		live,
		pointed = $bindable(),
	}: {
		live: Live;
		/** The node a line is pointed at, which the map opens. */
		pointed?: string;
	} = $props();

	const { to, node: toNode } = scoped();

	/** The nodes grouped by the name they are shown by, in the order the first of each comes. */
	const places = $derived(
		[
			...Map.groupBy(
				CODES.map((code) => {
					const held = live.view.nodes[code];
					return {
						code,
						heard: held ? liveness(held.heard_at, live.now) !== 'gone' : false,
						cpu: readings(held?.snapshot.machine)?.cpu,
					};
				}),
				(one) => nameOf(one.code).full,
			),
		].map(([name, members]) => {
			const read = members.flatMap((one) => (one.cpu === undefined ? [] : [one.cpu]));
			return {
				name,
				members,
				heard: members.every((one) => one.heard),
				// The mean of its processors, to one decimal always, so the column lines up.
				cpu: read.length ? `${(read.reduce((a, b) => a + b, 0) / read.length).toFixed(1)}%` : '–',
			};
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
		/** A place's name, a step under the page's body, so the list stays dense. */
		name: { color: 'var(--color-text)', fontSize: text.px13 },
		/** A heard place's dot in the map's own blue, so a line and its mark read as one. */
		heard: { color: 'var(--color-primary)' },
		count: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		value: {
			color: 'var(--color-text)',
			fontSize: text.px13,
			fontVariantNumeric: 'tabular-nums',
		},
	});
</script>

<div class="flex flex-col gap-1">
	<!-- What the columns are, said once and quietly, in place of a switch. -->
	<div
		aria-hidden="true"
		class="flex h-7 items-center justify-between {stylex.attrs(type.label).class}"
	>
		<span>Location</span>
		<span>CPU</span>
	</div>
	<ul class="-mx-2 flex flex-col" aria-label="Places, with how busy each one's processors are">
		{#each places as place (place.name)}
			{@const lead = place.members[0]?.code ?? ''}
			{@const shared = place.members.length > 1}
			<li>
				<a
					href={shared ? to('/nodes') : toNode(lead)}
					class="grid h-7 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 {stylex.attrs(
						styles.row,
					).class}"
					onpointerenter={() => (pointed = lead)}
					onpointerleave={() => (pointed = undefined)}
					onfocus={() => (pointed = lead)}
					onblur={() => (pointed = undefined)}
				>
					<span
						aria-hidden="true"
						class="size-1.5 rounded-full bg-current {stylex.attrs(
							place.heard ? styles.heard : tone.bad,
						).class}"
					></span>
					<span class="flex min-w-0 items-baseline gap-2">
						<span class="truncate {stylex.attrs(styles.name).class}">{place.name}</span>
						{#if shared}
							<span class="shrink-0 {stylex.attrs(styles.count).class}"
								>{place.members.length} nodes</span
							>
						{/if}
					</span>
					<span class={stylex.attrs(styles.value).class}>{place.cpu}</span>
				</a>
			</li>
		{/each}
	</ul>
</div>

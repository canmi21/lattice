<script lang="ts">
	/**
	 * Every place beside the map, a line each under quiet headings: its country's flag with a dot
	 * on its corner for whether its nodes are heard, its name whole, how many nodes stand there
	 * where it is more than one, how busy its busiest processor is and how much memory is in use,
	 * the busiest place first and the order taken again every few seconds. The rest of a place is
	 * the map's card, which pointing at a line opens. A node's line links to it, a shared place's
	 * to the nodes. See spec/console/overview.md, "The map is the page's whole picture".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { tick } from 'svelte';
	import { reorder } from '../design/motion.ts';
	import type { Live } from '../live.svelte.ts';
	import Flag from '../map/flag.svelte';
	import { nameOf } from '../map/places.ts';
	import { shown as drawn, worst } from '../map/marks.ts';
	import { readings, stateOf } from '../node.ts';
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

	const GIB = 1024 ** 3;
	/** The dot, the name, then the two figures, each column as wide as its widest. */
	const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_3rem_3rem] items-center gap-x-2.5';

	/** How long the list holds an order before taking it again, in milliseconds. */
	const EVERY = 5_000;

	/** The nodes grouped by the name they are shown by, in the order the first of each comes. */
	const places = $derived(
		[
			...Map.groupBy(
				CODES.map((code) => {
					const held = live.view.nodes[code];
					return {
						code,
						state: drawn(stateOf(held, live.now)),
						cpu: readings(held?.snapshot?.machine)?.cpu,
						memory: readings(held?.snapshot?.machine)?.memory?.used,
					};
				}),
				(one) => nameOf(one.code).full,
			),
		].map(([name, members]) => {
			const read = members.flatMap((one) => (one.cpu === undefined ? [] : [one.cpu]));
			const used = members.flatMap((one) => (one.memory === undefined ? [] : [one.memory]));
			// Its busiest processor, which a mean would hide behind two idle ones.
			const busiest = read.length ? Math.max(...read) : undefined;
			return {
				name,
				members,
				busiest,
				state: worst(members.map((one) => one.state)),
				// To one decimal always, so the column lines up.
				cpu: busiest === undefined ? '–' : `${busiest.toFixed(1)}%`,
				// Its nodes' memory in use together, in GiB written `G`, to one decimal always.
				memory: used.length ? `${(used.reduce((a, b) => a + b, 0) / GIB).toFixed(1)}G` : '–',
			};
		}),
	);

	/**
	 * The places busiest first, by whole percents, so two a fraction apart keep the order they had
	 * in `held` rather than trading places on every reading; one never read goes last.
	 */
	function ranked(held: string[]): string[] {
		const step = (place: (typeof places)[number]) =>
			place.busiest === undefined ? -1 : Math.floor(place.busiest);
		const was = (name: string) => (held.includes(name) ? held.indexOf(name) : held.length);
		return places
			.toSorted((a, b) => step(b) - step(a) || was(a.name) - was(b.name))
			.map((place) => place.name);
	}

	/**
	 * The order drawn: ranked as the first readings land, so a page come to is already in order,
	 * then taken again every `EVERY`. The server, which runs no effect, draws it ranked as it reads.
	 */
	let held: string[] = $state([]);
	$effect.pre(() => {
		if (!held.length && places.some((place) => place.busiest !== undefined)) held = ranked([]);
	});
	const shown = $derived(
		held.length
			? held.flatMap((name) => places.filter((place) => place.name === name))
			: ranked([]).flatMap((name) => places.filter((place) => place.name === name)),
	);

	let list: HTMLUListElement | undefined = $state();
	$effect(() => {
		const timer = setInterval(() => {
			// Not under the reader's pointer, which would find another place than it aimed at.
			if (!list || pointed !== undefined) return;
			const next = ranked(shown.map((place) => place.name));
			if (next.join() === shown.map((place) => place.name).join()) return;
			void reorder(list, async () => {
				held = next;
				await tick();
			});
		}, EVERY);
		return () => clearInterval(timer);
	});

	const styles = stylex.create({
		row: {
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--color-hover)',
			},
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		/** A place's name, a step under the page's body, so the list stays dense. */
		name: { color: 'var(--color-text)', fontSize: text.px13 },
		/** A heard place's dot in the map's own blue, so a line and its mark read as one. */
		live: { color: 'var(--color-primary)' },
		/** The dot's ring, the card's ground, so it reads as cut out of the flag's corner. */
		ring: { borderWidth: '1.5px', borderStyle: 'solid', borderColor: 'var(--color-surface)' },
		count: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		value: {
			color: 'var(--color-text)',
			fontSize: text.px13,
			fontVariantNumeric: 'tabular-nums',
		},
	});

	/** The dot's color, as its place's mark is drawn; see ../map/marks.ts. */
	const DOT = { live: styles.live, leaving: tone.warn, waiting: tone.quiet, gone: tone.bad };
</script>

<div class="flex flex-col gap-1">
	<!-- What the columns are, said once and quietly, in place of a switch. -->
	<div aria-hidden="true" class="h-7 {COLUMNS} {stylex.attrs(type.label).class}">
		<span>Location</span>
		<span class="text-right">CPU</span>
		<span class="text-right">RAM</span>
	</div>
	<ul
		bind:this={list}
		class="-mx-2 flex flex-col"
		aria-label="Places, with how busy each one's processors are and the memory in use"
	>
		{#each shown as place (place.name)}
			{@const lead = place.members[0]?.code ?? ''}
			{@const shared = place.members.length > 1}
			<li data-key={place.name}>
				<a
					href={shared ? to('/nodes') : toNode(lead)}
					class="h-7 rounded-md px-2 {COLUMNS} {stylex.attrs(styles.row).class}"
					onpointerenter={() => (pointed = lead)}
					onpointerleave={() => (pointed = undefined)}
					onfocus={() => (pointed = lead)}
					onblur={() => (pointed = undefined)}
				>
					<span class="flex min-w-0 items-center gap-2.5">
						<!-- Whether it is heard, as a dot on the flag's corner ringed in the card's own
						     ground, as the account's avatar wears its presence. -->
						<span class="relative inline-flex shrink-0">
							<Flag code={lead} size={16} />
							<span
								aria-hidden="true"
								class="absolute -right-1 bottom-0 size-2 rounded-full bg-current {stylex.attrs(
									DOT[place.state],
									styles.ring,
								).class}"
							></span>
						</span>
						<span class="truncate {stylex.attrs(styles.name).class}">{place.name}</span>
						{#if shared}
							<span class="shrink-0 {stylex.attrs(styles.count).class}"
								>{place.members.length} nodes</span
							>
						{/if}
					</span>
					<span class="text-right {stylex.attrs(type.shell, styles.value).class}">{place.cpu}</span>
					<span class="text-right {stylex.attrs(type.shell, styles.value).class}"
						>{place.memory}</span
					>
				</a>
			</li>
		{/each}
	</ul>
</div>

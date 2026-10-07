<script lang="ts">
	/**
	 * The nodes on a flat map of dots, one mark per place, each encoded as marks.ts says; hovering or
	 * focusing one opens its card, a click opens its leading node. Projected at build time
	 * (scripts/land.ts) and drawn whole by the server; a full one can turn into a globe (globe.ts).
	 * See spec/architecture/console.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, radius } from '@canmi/kit/tokens/vocabulary.stylex';
	import { liveness, readings, running } from '../node.ts';
	import { scoped } from '../scope/context.ts';
	import Segmented from '../ui/segmented.svelte';
	import type { Held } from '../wire.ts';
	import type { Globe } from './globe.ts';
	import { DOT, DOTS, HEIGHT, LOCATIONS, PITCH, POINTS, WIDTH } from './land.generated.ts';
	import { opacity, period, radius as size, shown, type Shown } from './marks.ts';
	import PlaceCard from './place-card.svelte';
	import { CLUSTERS, gather, PLACES } from './places.ts';

	let {
		states,
		now,
		selected,
		compact = false,
	}: {
		/** What is held of each node, by code; a node not in it has not been heard. */
		states: Record<string, Held>;
		/** The clock liveness is read against, in milliseconds. */
		now: number;
		/** A node whose place is drawn above the rest, as the one a page is about. */
		selected?: string;
		/** A small card: no card on hover and no globe. */
		compact?: boolean;
	} = $props();

	const { node: toNode } = scoped();

	const WORDS: Record<Shown, string> = { live: 'Live', gone: 'Gone' };
	const VIEWS = [
		{ key: 'flat', label: 'Flat' },
		{ key: 'globe', label: 'Globe' },
	] as const;
	/** Pixels between a mark's edge and its card, and between the card and the map's edge. */
	const GAP = 8;
	const EDGE = 4;
	/** How long a card stays once the pointer leaves its mark, to be reached across the gap. */
	const LINGER_MS = 150;

	const sites = $derived(
		gather(
			(Object.keys(POINTS) as (keyof typeof POINTS)[]).map((code) => {
				const held = states[code];
				const machine = readings(held?.snapshot.machine);
				return {
					code,
					role: PLACES[code].role,
					cluster: PLACES[code].cluster,
					state: shown(held ? liveness(held.heard_at, now) : 'gone'),
					apps: held ? running(held) : undefined,
					memory: machine?.memory?.total,
					used: machine?.memory?.used,
					cpu: machine?.cpu,
					heard: held?.heard_at,
					point: POINTS[code],
				};
			}),
		).map((site, index) => ({
			...site,
			radius: size(site.memory),
			opacity: opacity(site.apps),
			period: period(site.cpu),
			/** Where in its breath a place starts, spread by the golden ratio so none pulse together. */
			phase: (index * 0.618) % 1,
			lead: site.members[0]?.code ?? site.key,
			name: CLUSTERS[site.key] ?? PLACES[site.key as keyof typeof PLACES]?.place ?? site.key,
		})),
	);

	/** The place under the pointer or holding focus, and the one a page is about. */
	let active: string | undefined = $state();
	let linger: ReturnType<typeof setTimeout> | undefined;
	const lit = $derived(
		active ?? sites.find((site) => site.members.some((member) => member.code === selected))?.key,
	);
	const card = $derived(sites.find((site) => site.key === active));

	function open(key: string) {
		clearTimeout(linger);
		active = key;
	}
	function leave() {
		clearTimeout(linger);
		linger = setTimeout(() => (active = undefined), LINGER_MS);
	}
	/** Focus leaving a mark or its card closes the card, unless it moved from one to the other. */
	function blur(event: FocusEvent) {
		const to = event.relatedTarget as Node | null;
		const within = (to as Element | null)?.closest?.('[data-place]');
		if (!within || within.getAttribute('data-place') !== active) active = undefined;
	}

	let view: (typeof VIEWS)[number]['key'] = $state('flat');
	let host: HTMLDivElement | undefined = $state();
	let globe: Globe | undefined = $state.raw();

	$effect(() => {
		if (view !== 'globe' || !host) return;
		const into = host;
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		let made: Globe | undefined;
		let gone = false;
		void import('./globe.ts').then(({ mount }) => {
			if (gone) return;
			made = mount(into, still);
			globe = made;
		});
		return () => {
			gone = true;
			made?.destroy();
			globe = undefined;
		};
	});

	$effect(() => {
		globe?.mark(
			sites.map(({ members, radius, opacity, state }) => {
				const mean = (axis: 0 | 1) =>
					members.reduce(
						(total, { code }) => total + LOCATIONS[code as keyof typeof LOCATIONS][axis],
						0,
					) / members.length;
				return { location: [mean(0), mean(1)] as const, radius, opacity, state };
			}),
		);
	});

	/** The map's width in pixels, and the open card's size, read once the card is drawn. */
	let mapWidth = $state(0);
	let cardWidth = $state(0);
	let cardHeight = $state(0);

	/** Beside its mark, on whichever side has room, and never past the map's edges. */
	const placed = $derived.by(() => {
		if (!card || !mapWidth || !cardWidth) return undefined;
		const scale = mapWidth / WIDTH;
		const mapHeight = HEIGHT * scale;
		const [x, y] = [card.point[0] * scale, card.point[1] * scale];
		const reach = card.radius * scale + GAP;
		const right = x + reach;
		const left = right + cardWidth <= mapWidth - EDGE ? right : x - reach - cardWidth;
		const clamp = (value: number, most: number) => Math.min(Math.max(value, EDGE), most - EDGE);
		return {
			left: clamp(left, mapWidth - cardWidth),
			top: clamp(y - cardHeight / 2, mapHeight - cardHeight),
		};
	});

	const share = (units: number, whole: number) => `${(units / whole) * 100}%`;
	/** A mark's diameter as a share of the map's width, so it grows and shrinks with the map. */
	const across = (radius: number) => `${Number((((2 * radius) / WIDTH) * 100).toFixed(4))}cqw`;

	/** A heard mark's halo: out from the mark to 1.8 times it, fading as it goes. */
	const breathe = stylex.keyframes({
		from: { transform: 'scale(1)', opacity: 0.35 },
		to: { transform: 'scale(1.8)', opacity: 0 },
	});

	const styles = stylex.create({
		land: { stroke: 'var(--color-line-strong)' },
		marker: {
			outline: { default: 'none', ':focus-visible': '2px solid var(--color-accent)' },
			outlineOffset: 3,
			borderRadius: radius.full,
			transitionProperty: 'width, height',
			transitionDuration: duration.base,
		},
		fill: {
			backgroundColor: 'var(--color-primary)',
			borderRadius: radius.full,
			transitionProperty: 'opacity',
			transitionDuration: duration.base,
		},
		gone: { backgroundColor: 'var(--color-danger)' },
		halo: {
			display: { default: 'block', '@media (prefers-reduced-motion: reduce)': 'none' },
			backgroundColor: 'var(--color-primary)',
			borderRadius: radius.full,
			pointerEvents: 'none',
			animationName: breathe,
			animationTimingFunction: 'ease-out',
			animationIterationCount: 'infinite',
		},
	});
</script>

<div
	class="@container relative w-full select-none"
	style:aspect-ratio="{WIDTH} / {HEIGHT}"
	bind:clientWidth={mapWidth}
>
	{#if view === 'globe'}
		<div
			bind:this={host}
			class="absolute inset-0"
			role="img"
			aria-label="The nodes on a globe"
		></div>
	{:else}
		<svg viewBox="0 0 {WIDTH} {HEIGHT}" class="absolute inset-0 block size-full" aria-hidden="true">
			<!-- Each run of land is one line, dashed into square dots: scripts/project.ts. -->
			<path
				d={DOTS}
				fill="none"
				stroke-width={DOT}
				stroke-dasharray="{DOT} {PITCH - DOT}"
				class={stylex.attrs(styles.land).class}
			/>
		</svg>

		{#each sites as site (site.key)}
			{@const shared = site.members.length > 1}
			<a
				href={toNode(site.lead)}
				data-place={site.key}
				data-node={site.lead}
				data-state={site.state}
				data-radius={site.radius}
				aria-label="{shared
					? `${site.name}, ${site.members.length} nodes`
					: `${site.lead}, ${site.name}`}, {WORDS[site.state].toLowerCase()}"
				title={compact ? `${shared ? site.name : site.lead}: ${WORDS[site.state]}` : undefined}
				class="absolute block -translate-x-1/2 -translate-y-1/2 {stylex.attrs(styles.marker).class}"
				style:z-index={lit === site.key ? 10 : undefined}
				style:left={share(site.point[0], WIDTH)}
				style:top={share(site.point[1], HEIGHT)}
				style:width={across(site.radius)}
				style:height={across(site.radius)}
				onpointerenter={() => open(site.key)}
				onpointerleave={leave}
				onfocus={() => open(site.key)}
				onfocusout={blur}
			>
				{#if site.state === 'live'}
					<span
						data-halo
						class="absolute inset-0 {stylex.attrs(styles.halo).class}"
						style:animation-duration="{site.period}s"
						style:animation-delay="{-(site.phase * site.period).toFixed(2)}s"
					></span>
				{/if}
				<span
					class="absolute inset-0 {stylex.attrs(styles.fill, site.state === 'gone' && styles.gone)
						.class}"
					style:opacity={site.opacity}
				></span>
			</a>

			{#if card?.key === site.key && !compact}
				<!-- Right after its mark, so Tab moves from a shared place's mark into its rows. -->
				<div
					role="tooltip"
					data-place={site.key}
					class="absolute top-0 left-0 z-20 {shared ? '' : 'pointer-events-none'}"
					style:visibility={placed ? 'visible' : 'hidden'}
					style:transform={placed ? `translate(${placed.left}px, ${placed.top}px)` : undefined}
					bind:clientWidth={cardWidth}
					bind:clientHeight={cardHeight}
					onpointerenter={() => open(site.key)}
					onpointerleave={leave}
					onfocusout={blur}
				>
					<PlaceCard {site} {now} />
				</div>
			{/if}
		{/each}
	{/if}

	{#if !compact}
		<div class="absolute bottom-0 left-0">
			<Segmented options={VIEWS} bind:value={view} label="Map view" />
		</div>
	{/if}
</div>

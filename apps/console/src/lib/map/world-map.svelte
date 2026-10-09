<script lang="ts">
	/**
	 * The nodes on a flat map of dots, one mark per place, each encoded as marks.ts says; hovering or
	 * focusing one opens its card, a click opens its leading node. Projected at build time
	 * (scripts/land.ts) and drawn whole by the server; a full one can turn into a globe (globe.ts).
	 * See spec/architecture/console.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import { duration, radius } from '@canmi/kit/tokens/vocabulary.stylex';
	import { liveness, readings, running } from '../node.ts';
	import { scoped } from '../scope/context.ts';
	import GlobeIcon from '@tabler/icons-svelte-runes/icons/world';
	import MapIcon from '@tabler/icons-svelte-runes/icons/map';
	import { stilled, turn } from '../design/motion.ts';
	import Segmented from '../ui/segmented.svelte';
	import type { Held } from '../wire.ts';
	import type { Paint } from './globe.ts';
	import { DOT, DOTS, HEIGHT, LOCATIONS, PITCH, POINTS, WIDTH } from './land.generated.ts';
	import { opacity, period, radius as size, shown, type Shown } from './marks.ts';
	import PlaceCard from './place-card.svelte';
	import { gather, nameOf, nodeLabel, PLACES } from './places.ts';

	let {
		states,
		now,
		selected,
		compact = false,
		pointed,
	}: {
		/** What is held of each node, by code; a node not in it has not been heard. */
		states: Record<string, Held>;
		/** The clock liveness is read against, in milliseconds. */
		now: number;
		/** A node whose place is drawn above the rest, as the one a page is about. */
		selected?: string;
		/** A small card: no card on hover and no globe. */
		compact?: boolean;
		/** A node pointed at from outside the map, a list beside it, whose place's card opens. */
		pointed?: string;
	} = $props();

	const { node: toNode } = scoped();

	const WORDS: Record<Shown, string> = { live: 'Live', gone: 'Gone' };
	const VIEWS = [
		{ key: 'flat', label: 'Map', icon: MapIcon },
		{ key: 'globe', label: 'Globe', icon: GlobeIcon },
	] as const;
	/** The longitude the globe faces first: the Atlantic, the American and European nodes in view. */
	const FACING = -30;
	/** Degrees the globe turns a frame on its own, and per unit of the plot dragged across. */
	const SPIN = 0.06;
	const DRAG = 0.2;
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
			/** The members' mean latitude and longitude, where the globe draws the place. */
			location: [0, 1].map(
				(axis) =>
					site.members.reduce(
						(total, { code }) => total + LOCATIONS[code as keyof typeof LOCATIONS][axis as 0 | 1],
						0,
					) / site.members.length,
			) as unknown as readonly [number, number],
			name: nameOf(site.members[0]?.code ?? site.key).full,
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
	// A line of the list beside the map opens its place's card, and closes it when it lets go.
	$effect(() => {
		const code = pointed;
		untrack(() => {
			const key = sites.find((site) => site.members.some((member) => member.code === code))?.key;
			if (key) open(key);
			else if (code === undefined && active) leave();
		});
	});

	/** Focus leaving a mark or its card closes the card, unless it moved from one to the other. */
	function blur(event: FocusEvent) {
		const to = event.relatedTarget as Node | null;
		const within = (to as Element | null)?.closest?.('[data-place]');
		if (!within || within.getAttribute('data-place') !== active) active = undefined;
	}

	let view = $state<(typeof VIEWS)[number]['key']>('flat');
	/** How far round the map is, 0 flat and 1 a globe, and the longitude the globe faces. */
	const shape = $state({ t: 0 });
	let facing = $state(FACING);
	/** The globe's drawing, imported the first time it is asked for. */
	let round: typeof import('./globe.ts') | undefined = $state.raw();
	let canvas: HTMLCanvasElement | undefined = $state();
	let paint: Paint | undefined = $state.raw();
	/** Off the flat map: the canvas draws the land, and the server's dots step aside. */
	const turned = $derived(shape.t > 0 || view === 'globe');

	$effect(() => {
		const to = view === 'globe' ? 1 : 0;
		if (to === 1 && !round) {
			void import('./globe.ts').then((module) => (round = module));
			return;
		}
		if (!round) return;
		void turn(shape, to);
	});

	/** The colors the canvas paints in, read off the page and again when the theme switches. */
	function painted(): Paint {
		const read = (token: string) => {
			const probe = document.createElement('span');
			probe.style.color = `var(${token})`;
			document.body.appendChild(probe);
			const color = getComputedStyle(probe).color;
			probe.remove();
			return color;
		};
		return { land: read('--color-line-strong'), ring: read('--color-line') };
	}
	$effect(() => {
		if (!canvas) return;
		paint = painted();
		const themed = new MutationObserver(() => (paint = painted()));
		themed.observe(document.documentElement, { attributes: true });
		return () => themed.disconnect();
	});

	$effect(() => {
		if (!canvas || !round || !paint || !mapWidth) return;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.round(mapWidth * ratio);
		if (canvas.width !== width) {
			canvas.width = width;
			canvas.height = Math.round((width * HEIGHT) / WIDTH);
		}
		const context = canvas.getContext('2d');
		if (!context) return;
		context.setTransform(width / WIDTH, 0, 0, width / WIDTH, 0, 0);
		round.draw(context, shape.t, facing, paint);
	});

	/**
	 * Once round, the globe turns on its own, a little each frame, and a drag turns it by hand and
	 * leaves it spinning as fast as it was let go, easing back to its own pace; still for a reader
	 * who asked for less motion. See spec/console/overview.md, "The globe is the flat map turned
	 * round".
	 */
	let spin = SPIN;
	let held: { x: number; facing: number; last: number; at: number } | undefined = $state();
	$effect(() => {
		if (view !== 'globe' || stilled()) return;
		let frame = requestAnimationFrame(function step() {
			if (shape.t >= 0.999 && !held) {
				spin = spin * 0.95 + SPIN * 0.05;
				facing -= spin;
			}
			frame = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(frame);
	});
	/** A pointer's x in the plot's units. */
	const plotX = (event: PointerEvent) =>
		((event.clientX - (event.currentTarget as HTMLElement).getBoundingClientRect().left) /
			mapWidth) *
		WIDTH;
	function grab(event: PointerEvent) {
		if (shape.t < 0.5) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		const x = plotX(event);
		held = { x, facing, last: x, at: performance.now() };
	}
	function drag(event: PointerEvent) {
		if (!held) return;
		const x = plotX(event);
		facing = held.facing - (x - held.x) * DRAG;
		const now = performance.now();
		spin = ((held.last - x) * DRAG) / Math.max((now - held.at) / 16, 1);
		held.last = x;
		held.at = now;
	}
	function release() {
		held = undefined;
	}

	/** Where each place is drawn now, flat, round or between, and how much of it shows. */
	const at = $derived(
		new Map(
			sites.map((site) => [
				site.key,
				round && shape.t > 0
					? round.place(site.location, site.point, shape.t, facing)
					: { x: site.point[0], y: site.point[1], alpha: 1 },
			]),
		),
	);

	/** The map's width in pixels, and the open card's size, read once the card is drawn. */
	let mapWidth = $state(0);
	let cardWidth = $state(0);
	let cardHeight = $state(0);

	/** Beside its mark, on whichever side has room, and never past the map's edges. */
	const placed = $derived.by(() => {
		if (!card || !mapWidth || !cardWidth) return undefined;
		const scale = mapWidth / WIDTH;
		const mapHeight = HEIGHT * scale;
		const spot = at.get(card.key) ?? { x: card.point[0], y: card.point[1] };
		const [x, y] = [spot.x * scale, spot.y * scale];
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

<!-- A drag turns the globe once it is round; see spec/console/overview.md. -->
<div
	class="@container relative w-full select-none {view === 'globe'
		? held
			? 'cursor-grabbing'
			: 'cursor-grab'
		: ''}"
	style:aspect-ratio="{WIDTH} / {HEIGHT}"
	style:touch-action={view === 'globe' ? 'none' : undefined}
	bind:clientWidth={mapWidth}
	role="presentation"
	onpointerdown={view === 'globe' ? grab : undefined}
	onpointermove={view === 'globe' ? drag : undefined}
	onpointerup={release}
	onpointercancel={release}
>
	{#if turned}
		<canvas
			bind:this={canvas}
			class="pointer-events-none absolute inset-0 block size-full"
			aria-hidden="true"
		></canvas>
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
	{/if}

	{#each sites as site (site.key)}
		{@const shared = site.members.length > 1}
		{@const spot = at.get(site.key) ?? { x: site.point[0], y: site.point[1], alpha: 1 }}
		<a
			href={toNode(site.lead)}
			data-place={site.key}
			data-node={site.lead}
			data-state={site.state}
			data-radius={site.radius}
			aria-label="{shared
				? `${site.name}, ${site.members.length} nodes`
				: nodeLabel(site.lead)}, {WORDS[site.state].toLowerCase()}"
			title={compact
				? `${shared ? site.name : nodeLabel(site.lead)}: ${WORDS[site.state]}`
				: undefined}
			class="absolute block -translate-x-1/2 -translate-y-1/2 {stylex.attrs(styles.marker).class}"
			style:z-index={lit === site.key ? 10 : undefined}
			style:left={share(spot.x, WIDTH)}
			style:top={share(spot.y, HEIGHT)}
			style:opacity={spot.alpha < 1 ? spot.alpha : undefined}
			style:visibility={spot.alpha < 0.05 ? 'hidden' : undefined}
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

	{#if !compact}
		<div class="absolute top-0 right-0 z-30">
			<Segmented options={VIEWS} bind:value={view} label="Map view" />
		</div>
	{/if}
</div>

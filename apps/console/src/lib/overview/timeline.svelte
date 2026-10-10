<script lang="ts">
	/**
	 * The span, a line a node: its flag and health's dot, its place's telling part, and a row of
	 * slots, each the verdict of what the card asks -- deploys, services, being heard, or the
	 * worst -- grey nothing, green fine, blue planned, amber degraded, red down, its hover saying
	 * what it holds. The slots stretch to fill the row, else there are more or fewer; a view
	 * without nodes draws its busiest apps. See spec/console/overview.md, "A line is any of three
	 * things, or the worst of them".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { written } from '../chart/series.ts';
	import type { Live } from '../live.svelte.ts';
	import { partOf } from '../map/places.ts';
	import { scoped } from '../scope/context.ts';
	import { SCOPES, displayOf } from '../scope/scope.ts';
	import { type } from '../style.ts';
	import { offsetIn, offsetOf, timeZone } from '../ui/time-zone.ts';
	import type { History } from '../wire.ts';
	import Icon from '../design/icon.svelte';
	import HealthFlag from './health-flag.svelte';
	import Members from './members.svelte';
	import AccessPointIcon from '@tabler/icons-svelte-runes/icons/access-point';
	import RocketIcon from '@tabler/icons-svelte-runes/icons/rocket';
	import { glyphOf } from '../apps/glyphs.ts';
	import SlotTip, { type Fact, type Item, type Tip } from './slot-tip.svelte';
	import { healthOf } from './health.ts';
	import {
		type Axis,
		type Dimension,
		VERDICTS,
		type Verdict,
		WORDS,
		deployed,
		downFor,
		downIn,
		episode,
		lasting,
		served,
		unheardIn,
	} from './history.ts';
	import {
		ALPHABET,
		type Dry,
		type Ground,
		type Laid,
		type Named,
		decoded,
		hostingOf,
		judged,
		laid,
		opacityOf,
		runsOf,
	} from './judge.ts';
	import type { Trace } from './moving.ts';
	import {
		type Cell,
		DAY,
		GAP,
		type Mark,
		SHADES,
		SLOT,
		SPANS,
		type Span,
		aligned,
		fit,
		slotsIn,
	} from './timeline.ts';
	import { painted } from './verdict.ts';
	import { earlyTag } from './early.ts';
	import { Settled } from '../settled.svelte.ts';

	let {
		live,
		keep,
		nodes = true,
		by = 'node',
		back = '7d',
		dimension = $bindable('overview'),
		dry,
		steps,
		history,
	}: {
		live: Live;
		keep: (app: string) => boolean;
		/** Whether the view has nodes to draw a line each; without them the lines are apps. */
		nodes?: boolean;
		/** What a line is, where the view has nodes: a node, or an app. */
		by?: Axis;
		/** How far back the line reaches, by its name. */
		back?: Span;
		/** What a slot is the verdict of. */
		dimension?: Dimension;
		/** The first paint's lines and letters, drawn until the span is read whole. */
		dry?: Dry;
		/** Every step known of the span, read and live together; the span is read whole with it. */
		steps?: Trace[];
		/** Every node's minutes over the span, gathered here to the row's slots. */
		history?: History;
	} = $props();

	const { to, node: toNode, app: toApp } = scoped();
	const zone = timeZone();

	/**
	 * The labels as wide as the widest of them and a short step after, the rest the slots': one
	 * grid every row shares, so every row's slots start where the longest label leaves off.
	 */
	const COLUMNS = 'grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3';

	/** The row's width once the browser has laid it out; until then the early script draws it. */
	let width = $state(0);
	const span = $derived(SPANS.find((one) => one.key === back)?.span ?? 0);
	const layout = $derived(width ? fit(back, width) : undefined);
	const of = $derived(layout?.of ?? dry?.counts[0] ?? slotsIn(back));
	const length = $derived(span / of);

	/**
	 * The moment and the nodes the span is laid out at, each changing only when what the slots read
	 * of it does: the minute, not the second, and the apps each node runs, not every message a node
	 * sends, so the span is laid out again a minute at most, not every time a node reports.
	 */
	const minute = new Settled(() => Math.floor(live.now / 60_000) * 60_000);
	const hosting = new Settled(() => hostingOf(live.view.nodes), JSON.stringify);

	/** The span read whole, and laid out in the row's slots. */
	const ground: Ground | undefined = $derived(
		steps && {
			steps,
			history,
			nodes: hosting.current,
			keep,
			withNodes: nodes,
			by,
			back,
			now: minute.current,
			offset: (at) => offsetIn(zone, at),
		},
	);
	const lay = $derived(ground && laid(ground, of));
	/** Until then, the slots fall where the first paint's did, ending at the moment it was cut. */
	const bounds = $derived(
		lay?.bounds ?? aligned(dry?.at ?? live.now, length, of, offsetIn(zone, dry?.at ?? live.now)),
	);
	const lines: Named[] = $derived(lay?.lines ?? dry?.lines ?? []);
	/** The first paint's letters for the count drawn, a string a line. */
	const letters = $derived(dry?.rows[dry.counts.indexOf(of)]);

	/** Each place `apps` run now, one entry a node and app, those held on purpose aside. */
	const runs = (apps: string[]) => runsOf(live.view.nodes, apps);

	/**
	 * How an app is now across the nodes that run it, as a node's flag says how the node is: well
	 * running on all of them, leaving where down on some, down where down on every one, quiet
	 * where no node runs it now or every one holds it on purpose.
	 */
	function appHealth(apps: string[]): 'well' | 'leaving' | 'down' | 'quiet' {
		const held = runs(apps);
		if (!held.length) return 'quiet';
		const down = held.filter((one) => !one.running).length;
		return down === 0 ? 'well' : down < held.length ? 'leaving' : 'down';
	}

	/** One slot as drawn: its verdict, how strong, what it says, and where it leads. */
	interface Drawn {
		key: string;
		verdict: Verdict;
		opacity: number;
		/** Its time and its verdicts' words, for assistive technology. */
		label: string;
		href?: string;
	}

	/** Whether the app lines span more than one layer, so each layer is headed. */
	const layered = $derived(new Set(lines.map((line) => line.layer)).size > 1);

	/** How long, in its one largest unit: `42s`, `3m`. */
	function took(mark: Mark): string {
		if (!mark.finished_at) return 'now';
		const seconds = Math.round((Date.parse(mark.finished_at) - Date.parse(mark.started_at)) / 1000);
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
		return `${Math.round(seconds / 3600)}h`;
	}
	const appsOf = (mark: Mark) => mark.apps.map(displayOf).join(', ');
	/** Where a slot leads: the run in it that failed, else the latest. */
	const leadOf = (cell: Cell): Mark =>
		cell.marks.find((one) => one.outcome === 'failed' || one.outcome === 'mixed') ??
		(cell.marks.at(-1) as Mark);
	const hrefOf = (mark: Mark) =>
		mark.run === undefined ? `${toNode(mark.node)}?tab=events` : to(`/deployments/${mark.run}`);
	/** Where a line's label leads: its node's page, or its app's. */
	const lineHref = (line: Named) => (line.code ? toNode(line.code) : toApp(line.app ?? ''));

	const dayOf = (at: number) => written(at, zone, 'day');
	/**
	 * A slot's time on the reader's clock, its date first: `Oct 9, 9 PM`, `Oct 9`, `Oct 7 – 9`; and
	 * the zone it is written in, the reader's, as its offset then.
	 */
	function timeOf(start: number): Pick<Tip, 'when' | 'zone'> {
		return { when: whenOf(start), zone: offsetOf(zone, start) };
	}
	function whenOf(start: number): string {
		if (length < DAY) return `${dayOf(start)}, ${written(start, zone, 'hour').replace(':00', '')}`;
		if (length === DAY) return dayOf(start);
		const [from, to] = [dayOf(start), dayOf(start + length - 1)];
		const [month, day] = to.split(' ');
		return from.startsWith(`${month} `) ? `${from} – ${day}` : `${from} – ${to}`;
	}

	/** Names shown in a tip at most; the rest are counted. */
	const NAMED = 4;

	/** The first paint's verdict of a slot, while the span is not yet read whole. */
	function letterOf(at: number, index: number): { verdict: Verdict; shade: number; facts: Fact[] } {
		const { verdict, shade } = decoded(letters?.[at]?.[index] ?? ALPHABET[0] ?? 'a');
		const facts: Fact[] =
			dimension === 'overview' ? [] : [{ what: dimension, verdict, word: WORDS[dimension][verdict] }];
		return { verdict, shade, facts };
	}

	/** The slot at `index` of the line at `at`, judged, with the facts its card asks for. */
	function judgedAt(at: number, index: number) {
		const line = lines[at] as Named;
		const row = (lay as Laid).rows[at];
		const cell = row?.cells[index];
		const one = judged(
			ground as Ground,
			lay as Laid,
			row?.line ?? { ...line, marks: [] },
			cell,
			index,
			dimension,
		);
		const wordOf = (what: Fact['what'], verdict: Verdict) =>
			verdict === 'none' && what !== 'deploys' && one.unrecorded
				? 'Unrecorded'
				: WORDS[what][verdict];
		const facts: Fact[] = [
			{ what: 'deploys' as const, verdict: one.deploys },
			{ what: 'services' as const, verdict: one.services },
			...(line.code ? [{ what: 'connectivity' as const, verdict: one.connectivity }] : []),
		]
			.filter((fact) => dimension === 'overview' || fact.what === dimension)
			.map((fact) => ({ ...fact, word: wordOf(fact.what, fact.verdict) }));
		return { line, cell, one, facts };
	}

	/**
	 * The slot at `index` of the line at `at` as the card's dimension draws it: judged where the
	 * span is read whole, else the first paint's letter. Its tip is worked out on a hover alone.
	 */
	function slotOf(at: number, index: number): Drawn {
		const key = `${(lines[at] as Named).key} ${index}`;
		if (!lay || !ground) {
			const { verdict, shade, facts } = letterOf(at, index);
			const label = [whenOf(bounds.start + index * length), ...facts.map((fact) => fact.word)];
			return { key, verdict, opacity: opacityOf(shade), label: label.join(', ') };
		}
		const { cell, one, facts } = judgedAt(at, index);
		// The overview leads to a run where the deploys are what it draws; the rest, to any run.
		const leads = dimension !== 'overview' || one.changed;
		return {
			key,
			verdict: one.verdict,
			opacity: opacityOf(one.shade),
			label: [whenOf(one.start), ...facts.map((fact) => fact.word)].join(', '),
			href: cell && leads ? hrefOf(leadOf(cell)) : undefined,
		};
	}

	/** The tip of the slot at `index` of the line at `at`: its time, its facts, what was in it. */
	function tipOf(at: number, index: number): Tip {
		if (!lay || !ground) {
			const { facts } = letterOf(at, index);
			return { ...timeOf(bounds.start + index * length), facts, items: [], more: 0 };
		}
		const { line, cell, one, facts } = judgedAt(at, index);
		const members = line.apps ?? [];
		const asks = (what: Fact['what']) => dimension === 'overview' || dimension === what;
		/** One node's history as asked, and where this slot stands in it. */
		const raw = (code: string) => history?.nodes[code] ?? [];
		const step = (history?.slot ?? 0) * 1000;
		/** How long the trouble this slot is part of lasted, to its end or, going on, to now. */
		const lastedIn = (code: string, of: Parameters<typeof episode>[4], fallback: number) =>
			lasting(episode(raw(code), step, one.start, one.end, of) ?? fallback);
		const own = one.own;
		const items: Item[] = [
			...(asks('services')
				? members.length
					? one.across.flatMap(({ code, slot }) =>
							members.flatMap((app) =>
								downIn(slot, app).map((down) => ({
									key: `down ${code} ${app}`,
									icon: glyphOf(app),
									flag: code,
									// Where the line stands for several apps, which of them it was.
									name: members.length > 1 ? `${partOf(code)} · ${app}` : partOf(code),
									href: toNode(code),
									lasted: lastedIn(code, downFor(app), down.seconds),
									verdict: served(slot, app),
								})),
							),
						)
					: downIn(own).map((down) => ({
							key: `down ${down.app}`,
							icon: glyphOf(down.app),
							name: displayOf(down.app),
							href: toApp(down.app),
							lasted: lastedIn(line.code ?? '', downFor(down.app), down.seconds),
							verdict: one.services,
						}))
				: []),
			...(asks('connectivity') && own?.missing && line.code
				? [
						{
							key: 'unheard',
							icon: AccessPointIcon,
							name: 'Unheard',
							href: `${toNode(line.code)}?tab=events`,
							lasted: lastedIn(line.code, unheardIn, own.missing * 60),
							verdict: one.connectivity,
						},
					]
				: []),
			...(asks('deploys')
				? (cell?.marks ?? []).map((mark) => ({
						key: mark.key,
						icon: RocketIcon,
						name: appsOf(mark),
						href: hrefOf(mark),
						lasted: took(mark),
						verdict: deployed(mark.outcome),
					}))
				: []),
		];
		return {
			...timeOf(one.start),
			facts,
			items: items.slice(0, NAMED),
			more: Math.max(0, items.length - NAMED),
		};
	}

	/**
	 * The slot pointed at or focused, which its tip stands for. The slot, the tip and the unseen
	 * bridge between them are one place to hold: the tip stays while the pointer is in any of
	 * them and goes the moment it leaves all three, with no delay to wait out.
	 */
	let pointed: { key: string; tip: Tip; at: DOMRect; slot: HTMLElement } | undefined = $state();
	/**
	 * Hushed once a line of the tip is chosen: the tip goes, and the slot under the still pointer
	 * does not open another until the pointer has left it.
	 */
	let hushed = false;
	const point = (key: string, at: number, index: number) => (event: Event) => {
		if (hushed && event.type === 'pointerenter') return;
		const slot = event.currentTarget as HTMLElement;
		pointed = { key, tip: tipOf(at, index), at: slot.getBoundingClientRect(), slot };
	};
	const leave = () => (pointed = undefined);
	/** Off the slot, unless onto its tip. */
	let tipped: HTMLElement | undefined = $state();
	const off = (event: PointerEvent) => {
		hushed = false;
		const to = event.relatedTarget as Node | null;
		if (to && tipped?.contains(to)) return;
		leave();
	};
	/** Off the tip, unless back onto its slot. */
	const away = (event: PointerEvent) => {
		const to = event.relatedTarget as Node | null;
		if (to && pointed?.slot.contains(to)) return;
		leave();
	};
	// A scroll moves the slot from under its tip, so the tip goes with the scroll.
	$effect(() => {
		addEventListener('scroll', leave, { capture: true, passive: true });
		return () => removeEventListener('scroll', leave, { capture: true });
	});

	const styles = stylex.create({
		label: { color: 'var(--color-text)', fontSize: text.px13 },
		glyph: { color: 'var(--color-text-muted)' },
		/** An app's dot, in the colors a node's flag wears its own. */
		well: { backgroundColor: 'var(--color-primary)' },
		leaving: { backgroundColor: 'var(--color-warn)' },
		down: { backgroundColor: 'var(--color-danger)' },
		quiet: { backgroundColor: 'var(--color-text-muted)' },
		none: { color: 'var(--color-text-muted)', fontSize: text.px13 },
	});
</script>

{#snippet slot(one: Drawn, at: number, index: number)}
	<!-- Three layers: what the pointer holds, the slot and half the gap either side of it, so a
	     pointer moving along the row never falls between two; the ring, on the slot alone; and the
	     shade, on what it holds, so the ring is drawn whole. -->
	<svelte:element
		this={one.href ? 'a' : 'span'}
		href={one.href}
		role={one.href ? undefined : 'img'}
		aria-label={one.label}
		tabindex={one.href ? undefined : -1}
		class="group relative block h-full min-w-0 outline-none hover:z-10 focus-visible:z-10 {layout
			? 'shrink-0'
			: 'flex-1'}"
		style:width={layout ? `${layout.slot + layout.gap}px` : undefined}
		style:padding-inline={layout ? `${layout.gap / 2}px` : undefined}
		onpointerenter={point(one.key, at, index)}
		onpointerleave={off}
		onfocus={point(one.key, at, index)}
		onblur={leave}
	>
		<span
			class="block size-full rounded-[2px] outline-offset-0 outline-[var(--color-accent)] group-hover:outline-2 group-hover:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-solid {pointed?.key ===
			one.key
				? 'outline-2 outline-solid'
				: ''}"
		>
			<span
				class="block size-full rounded-[2px] {stylex.attrs(painted[one.verdict]).class}"
				style:opacity={one.verdict === 'none' ? undefined : one.opacity.toFixed(3)}
			></span>
		</span>
	</svelte:element>
{/snippet}

{#if nodes || lines.length}
	<div class="{COLUMNS} gap-y-1.5">
		{#each lines as line, at (line.key)}
			{#if line.layer && line.layer !== lines[at - 1]?.layer && layered}
				<!-- Where a layer's apps begin, said once and quietly, as the place list's heads are. -->
				<div class="col-span-2 flex h-6 items-end {stylex.attrs(type.label).class}">
					{SCOPES.find((one) => one.key === line.layer)?.label}
				</div>
			{/if}
			<div class="col-span-2 grid h-6 grid-cols-subgrid items-center">
				{#snippet label()}
					{#if line.code}
						<HealthFlag
							code={line.code}
							told={healthOf(live.view.nodes[line.code], live.now)}
							size={14}
						/>
					{:else if line.app}
						<Icon
							icon={glyphOf(line.app)}
							size={14}
							badge={stylex.attrs(styles[appHealth(line.apps ?? [])]).class}
							class={stylex.attrs(styles.glyph).class}
						/>
					{/if}
					<span class="truncate">{line.label}</span>
				{/snippet}
				{#if (line.apps?.length ?? 0) > 1}
					<div class="flex min-w-0 {stylex.attrs(styles.label).class}" title={line.whole}>
						<Members apps={line.apps ?? []} hrefOf={toApp}>{@render label()}</Members>
					</div>
				{:else}
					<a
						href={lineHref(line)}
						title={line.whole}
						class="flex min-w-0 items-center gap-2.5 {stylex.attrs(styles.label).class}"
					>
						{@render label()}
					</a>
				{/if}
				<!-- Its slots as wide and as far apart as the row lets them be, ending at now; half a gap
				     out past each end, which the first and last slots' reach fills. -->
				<div class="relative min-w-0">
					{#if at === 0}
						<!-- What the slots are measured against: the column itself, empty and as wide. -->
						<div
							aria-hidden="true"
							class="absolute inset-x-0 top-0 h-0"
							bind:clientWidth={width}
						></div>
					{/if}
					{#if layout}
						<div class="flex h-5 justify-end" style:margin-inline="{-layout.gap / 2}px">
							{#each { length: layout.of }, index (index)}
								{@render slot(slotOf(at, index), at, index)}
							{/each}
						</div>
					{:else}
						<!-- Drawn by the early script below before the first paint; see ./early.ts. -->
						<div data-early class="flex h-5 justify-end"></div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
	{#if dry}
		{@html earlyTag({
			counts: dry.counts,
			bounds: { slot: SLOT, gap: GAP },
			layers: [
				'group relative block h-full min-w-0 shrink-0 outline-none',
				'block size-full rounded-[2px]',
				'block size-full rounded-[2px]',
			],
			paints: VERDICTS.map((verdict) => stylex.attrs(painted[verdict]).class ?? ''),
			opacities: Array.from({ length: SHADES }, (_, shade) => opacityOf(shade + 1).toFixed(3)),
			alphabet: ALPHABET,
			rows: dry.rows,
			budget: 10,
		})}
	{/if}
	{#if pointed}
		<SlotTip
			tip={pointed.tip}
			at={pointed.at}
			bind:root={tipped}
			onleave={away}
			onpick={dimension === 'overview'
				? (what) => {
						dimension = what;
						hushed = true;
						leave();
					}
				: undefined}
		/>
	{/if}
{:else}
	<p class="flex min-h-40 items-center justify-center {stylex.attrs(styles.none).class}">
		Nothing deployed in this span
	</p>
{/if}

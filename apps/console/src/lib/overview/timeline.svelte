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
	import { nameOf, partOf } from '../map/places.ts';
	import { CODES } from '../nodes/facts.ts';
	import { scoped } from '../scope/context.ts';
	import { SCOPES, type Scope, displayOf, scopeOf } from '../scope/scope.ts';
	import { type } from '../style.ts';
	import { LOCATIONS } from '../map/land.generated.ts';
	import { offsetIn, offsetOf, timeZone } from '../ui/time-zone.ts';
	import type { History, Slot } from '../wire.ts';
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
		type Verdict,
		WORDS,
		deployed,
		downFor,
		downIn,
		episode,
		gathered,
		heard,
		served,
		servedOf,
		lasting,
		unheardIn,
		worse,
	} from './history.ts';
	import type { Step } from './moving.ts';
	import {
		type Cell,
		DAY,
		type Mark,
		type Outcome,
		SHADES,
		SPANS,
		type Span,
		aligned,
		fit,
		marks,
		shades,
		slots,
		slotsIn,
	} from './timeline.ts';
	import { painted } from './verdict.ts';

	let {
		live,
		steps,
		keep,
		nodes = true,
		by = 'node',
		back = '7d',
		dimension = $bindable('overview'),
		history,
	}: {
		live: Live;
		/** Every step known, history and live together. */
		steps: Step[];
		keep: (app: string) => boolean;
		/** Whether the view has nodes to draw a line each; without them the lines are apps. */
		nodes?: boolean;
		/** What a line is, where the view has nodes: a node, or an app. */
		by?: Axis;
		/** How far back the line reaches, by its name. */
		back?: Span;
		/** What a slot is the verdict of. */
		dimension?: Dimension;
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

	/** The row's width once the browser has laid it out; the server draws the usual count. */
	let width = $state(0);
	const span = $derived(SPANS.find((one) => one.key === back)?.span ?? 0);
	const layout = $derived(width ? fit(back, width) : undefined);
	const of = $derived(layout?.of ?? slotsIn(back));
	/** The row's slots on whole times of the reader's clock, the last holding now. */
	const length = $derived(span / of);
	const bounds = $derived(aligned(live.now, length, of, offsetIn(zone, live.now)));
	const reach = $derived(bounds.end - bounds.start);
	/** Past the mirror's 30 days a deploy is read from the history's day counts, not its runs. */
	const counted = $derived(span > 30 * DAY);

	const drawn = $derived(
		marks(
			steps.filter((step) => keep(step.app)),
			bounds.end,
			reach,
		),
	);

	interface Line {
		key: string;
		href: string;
		marks: Mark[];
		code?: string;
		app?: string;
		/** Every app the line stands for, more than one where apps share a name. */
		apps?: string[];
		/** An app's layer, which its line is grouped under. */
		layer?: Scope;
		label: string;
		/** The whole name, on the label's hover. */
		whole: string;
	}

	/** The nodes west to east, as the map lays them out left to right, a place's nodes together. */
	const WEST_TO_EAST = CODES.toSorted((a, b) => LOCATIONS[a][1] - LOCATIONS[b][1]);
	/** The layers an app line is grouped in, in the order the console's views name them. */
	const LAYERS = ['infra', 'platform', 'services'] as const;

	const lines = $derived.by((): Line[] => {
		if (nodes && by === 'node') {
			return WEST_TO_EAST.map((code) => ({
				key: code,
				href: toNode(code),
				marks: drawn.filter((mark) => mark.node === code),
				code,
				label: partOf(code),
				whole: nameOf(code).full,
			}));
		}
		// Every app the view shows: what the nodes run now, and what ran in the span besides.
		const apps = new Set([
			...Object.values(live.view.nodes).flatMap((entry) =>
				(entry.snapshot?.apps ?? []).map((app) => app.name),
			),
			...drawn.flatMap((mark) => mark.apps),
		]);
		// Apps one name, as apk and apt are both Package Updates, are one line, as a place's nodes
		// are one line of the place list; the line's name opens a choice between them.
		const named = Map.groupBy(
			[...apps].filter((app) => keep(app)),
			(app) => displayOf(app),
		);
		return [...named]
			.map(([name, members]) => ({ name, members: members.toSorted() }))
			.toSorted(
				(a, b) =>
					LAYERS.indexOf(scopeOf(a.members[0] ?? '')) -
						LAYERS.indexOf(scopeOf(b.members[0] ?? '')) || a.name.localeCompare(b.name),
			)
			.map(({ name, members }) => ({
				key: members.join(' '),
				href: toApp(members[0] ?? ''),
				marks: drawn.filter((mark) => mark.apps.some((app) => members.includes(app))),
				app: members[0],
				apps: members,
				layer: scopeOf(members[0] ?? ''),
				label: name,
				whole: members.length > 1 ? `${name}: ${members.join(', ')}` : name,
			}));
	});

	/** Each node's history gathered to the row's slots, once for every line. */
	const minutes = $derived(
		new Map<string, (Slot | undefined)[]>(
			CODES.map((code) => [code, gathered(history, code, bounds.end, reach, of)]),
		),
	);

	/**
	 * When each node's history begins, its first minute due: a slot before it is one nothing was
	 * recording, which its hover says rather than reading as a node with nothing to report.
	 */
	const began = $derived(
		new Map(
			Object.entries(history?.nodes ?? {}).flatMap(([code, its]) => {
				const first = its.find((one) => one.due);
				return first ? [[code, Date.parse(first.at)] as const] : [];
			}),
		),
	);
	const earliest = $derived(began.size ? Math.min(...began.values()) : undefined);

	/**
	 * An app's services as the overview weighs them across the nodes that run it: down where it is
	 * down on every one of them, degraded where on some, as a node's are weighed among its apps.
	 */
	function hostsOf(apps: string[], across: { code: string; slot: Slot }[]): Verdict {
		const pairs = across.flatMap((one) => apps.map((app) => served(one.slot, app)));
		const worst = pairs.reduce<Verdict>(worse, 'none');
		if (worst !== 'down') return worst;
		const hosts = runs(apps).length;
		const down = pairs.filter((one) => one === 'down').length;
		return hosts > 0 && down >= hosts ? 'down' : 'degraded';
	}

	/** Each place `apps` run now, one entry a node and app, those held on purpose aside. */
	const runs = (apps: string[]) =>
		CODES.flatMap((code) =>
			(live.view.nodes[code]?.snapshot?.apps ?? []).filter(
				(one) => apps.includes(one.name) && !one.held,
			),
		);

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

	/** How many apps a node runs as it is read now, those held on purpose aside. */
	const running = (code: string) =>
		live.view.nodes[code]?.snapshot?.apps.filter((app) => !app.held).length ?? 0;

	/** A deploy's outcome from a slot's day counts, as a run's would be. */
	function counts(slot: Slot | undefined): Outcome | undefined {
		const runs = slot?.runs;
		if (!runs) return undefined;
		if (runs.running) return 'running';
		const failed = runs.failed ?? 0;
		const done = runs.succeeded ?? 0;
		if (runs.partly_failed || (failed && done)) return 'mixed';
		if (failed) return 'failed';
		return done ? 'succeeded' : undefined;
	}

	/** One slot as drawn: its verdict, how strong, its tip, and where it leads. */
	interface Drawn {
		key: string;
		verdict: Verdict;
		opacity: number;
		tip: Tip;
		href?: string;
	}

	const rows = $derived(lines.map((line) => ({ line, cells: slots(line.marks, of) })));
	/** Whether the app lines span more than one layer, so each layer is headed. */
	const layered = $derived(new Set(lines.map((line) => line.layer)).size > 1);
	const shaded = $derived(shades(rows.flatMap((row) => row.cells)));

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
	/** A shade's opacity: a quarter at the palest, whole at the darkest, in even steps between. */
	const opacityOf = (shade: number) => 0.25 + (0.75 * (shade - 1)) / (SHADES - 1);
	const hrefOf = (mark: Mark) =>
		mark.run === undefined ? `${toNode(mark.node)}?tab=events` : to(`/deployments/${mark.run}`);

	const dayOf = (at: number) => written(at, zone, 'day');
	/**
	 * A slot's time on the reader's clock, its date first: `Oct 9, 9 PM`, `Oct 9`, `Oct 7 – 9`; and
	 * the zone it is written in, the reader's, as its offset then.
	 */
	function timeOf(start: number): Pick<Tip, 'when' | 'zone'> {
		const zoned = offsetOf(zone, start);
		if (length < DAY) {
			const hour = written(start, zone, 'hour').replace(':00', '');
			return { when: `${dayOf(start)}, ${hour}`, zone: zoned };
		}
		if (length === DAY) return { when: dayOf(start), zone: zoned };
		const last = start + length - 1;
		const [from, to] = [dayOf(start), dayOf(last)];
		const [month, day] = to.split(' ');
		return {
			when: from.startsWith(`${month} `) ? `${from} – ${day}` : `${from} – ${to}`,
			zone: zoned,
		};
	}

	/** Names shown in a tip at most; the rest are counted. */
	const NAMED = 4;

	/** The slot at `index` of `line`, as the card's dimension draws it. */
	function slotOf(line: Line, cell: Cell | undefined, index: number): Drawn {
		const start = bounds.start + index * length;
		const end = start + length;
		const own = line.code ? minutes.get(line.code)?.[index] : undefined;
		// An app's services are the worst any node had of it.
		const members = line.apps ?? [];
		const across = members.length
			? CODES.flatMap((code) => {
					const slot = minutes.get(code)?.[index];
					return slot ? [{ code, slot }] : [];
				})
			: [];

		const outcome = counted ? counts(own) : cell?.outcome;
		const deploys = deployed(outcome);
		const services = members.length
			? across
					.flatMap((one) => members.map((app) => served(one.slot, app)))
					.reduce<Verdict>(worse, 'none')
			: served(own);
		const connectivity = line.code ? heard(own) : 'none';

		const from = line.code ? began.get(line.code) : earliest;
		const unrecorded = from === undefined || end <= from;
		const wordOf = (what: Fact['what'], verdict: Verdict) =>
			verdict === 'none' && what !== 'deploys' && unrecorded ? 'Unrecorded' : WORDS[what][verdict];
		const facts: Fact[] = [
			{ what: 'deploys' as const, verdict: deploys },
			{ what: 'services' as const, verdict: services },
			...(line.code ? [{ what: 'connectivity' as const, verdict: connectivity }] : []),
		]
			.filter((fact) => dimension === 'overview' || fact.what === dimension)
			.map((fact) => ({ ...fact, word: wordOf(fact.what, fact.verdict) }));

		const asks = (what: Fact['what']) => dimension === 'overview' || dimension === what;
		/** One node's history as asked, and where this slot stands in it. */
		const raw = (code: string) => history?.nodes[code] ?? [];
		const step = (history?.slot ?? 0) * 1000;
		/** How long the trouble this slot is part of lasted, to its end or, going on, to now. */
		const lastedIn = (code: string, of: (slot: Slot) => number, fallback: number) =>
			lasting(episode(raw(code), step, start, end, of) ?? fallback);
		const items: Item[] = [
			...(asks('services')
				? members.length
					? across.flatMap(({ code, slot }) =>
							members.flatMap((app) =>
								downIn(slot, app).map((one) => ({
									key: `down ${code} ${app}`,
									icon: glyphOf(app),
									flag: code,
									// Where the line stands for several apps, which of them it was.
									name: members.length > 1 ? `${partOf(code)} · ${app}` : partOf(code),
									href: toNode(code),
									lasted: lastedIn(code, downFor(app), one.seconds),
									verdict: served(slot, app),
								})),
							),
						)
					: downIn(own).map((one) => ({
							key: `down ${one.app}`,
							icon: glyphOf(one.app),
							name: displayOf(one.app),
							href: toApp(one.app),
							lasted: lastedIn(line.code ?? '', downFor(one.app), one.seconds),
							verdict: services,
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
							verdict: connectivity,
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
		const tip: Tip = {
			...timeOf(start),
			facts,
			items: items.slice(0, NAMED),
			more: Math.max(0, items.length - NAMED),
		};
		const deployShade = cell ? opacityOf(shaded.get(cell) ?? SHADES) : 1;

		if (dimension !== 'overview') {
			const verdict = { deploys, services, connectivity }[dimension];
			return {
				verdict,
				// Deploys are shaded by how many ran; the rest are drawn whole.
				opacity: dimension === 'deploys' ? deployShade : 1,
				key: `${line.key} ${index}`,
				tip,
				href: cell ? hrefOf(leadOf(cell)) : undefined,
			};
		}
		// A deploy that went well is still a change made, so the overview draws it blue with what
		// is planned; green is left for a slot where nothing changed and nothing went wrong.
		const changed = deploys === 'fine' ? 'planned' : deploys;
		// A node's services weighed among all it runs: some down is degraded, every one down is down.
		const weighed = line.code ? servedOf(own, running(line.code)) : hostsOf(members, across);
		const verdict = [changed, weighed, connectivity].reduce(worse, 'none');
		return {
			verdict,
			opacity: 1,
			key: `${line.key} ${index}`,
			tip,
			href: cell && verdict === changed ? hrefOf(leadOf(cell)) : undefined,
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
	const point = (one: Drawn) => (event: Event) => {
		if (hushed && event.type === 'pointerenter') return;
		const slot = event.currentTarget as HTMLElement;
		pointed = { key: one.key, tip: one.tip, at: slot.getBoundingClientRect(), slot };
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

{#snippet slot(one: Drawn)}
	<!-- Three layers: what the pointer holds, the slot and half the gap either side of it, so a
	     pointer moving along the row never falls between two; the ring, on the slot alone; and the
	     shade, on what it holds, so the ring is drawn whole. -->
	<svelte:element
		this={one.href ? 'a' : 'span'}
		href={one.href}
		role={one.href ? undefined : 'img'}
		aria-label={[one.tip.when, ...one.tip.facts.map((fact) => fact.word)].join(', ')}
		tabindex={one.href ? undefined : -1}
		class="group relative block h-full min-w-0 outline-none hover:z-10 focus-visible:z-10 {layout
			? 'shrink-0'
			: 'flex-1'}"
		style:width={layout ? `${layout.slot + layout.gap}px` : undefined}
		style:padding-inline={layout ? `${layout.gap / 2}px` : undefined}
		onpointerenter={point(one)}
		onpointerleave={off}
		onfocus={point(one)}
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
		{#each rows as row, at (row.line.key)}
			{@const line = row.line}
			{#if line.layer && line.layer !== rows[at - 1]?.line.layer && layered}
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
						href={line.href}
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
					<div
						class="flex h-5 justify-end {layout ? '' : 'gap-px'}"
						style:margin-inline={layout ? `${-layout.gap / 2}px` : undefined}
					>
						{#each row.cells as cell, index (index)}
							{@render slot(slotOf(line, cell, index))}
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</div>
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

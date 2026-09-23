<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { border, family, line, radius, text, weight } from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The visual half of the Cargo widget. Every interface colour is the token variable
	 * `libs/tokens` already declares. See spec/architecture/css/authoring.md.
	 *
	 * Two exceptions stay: a tile's white ink and its fill in `palette.css`, a local mirror this
	 * layer does not own (spec/styling/controls.md), and `shadow-sm` on it (spec/todo/css.md,
	 * "A shadow is one utility, two declarations and four variables the visual layer cannot
	 * restate").
	 */
	const styles = stylex.create({
		/** A tile's crate name, over whichever palette colour the tile drew. */
		tileName: {
			fill: 'white',
			fontSize: text.px11,
			fontWeight: weight.medium,
		},
		tileSize: {
			fill: 'rgb(255 255 255 / 70%)',
			// Two rungs under the tile name, as tokei's own pair is two under its tile name.
			fontSize: text.px9,
		},
		/** The line shown in place of a chart when no dependency has a size. */
		empty: {
			color: 'var(--color-text-soft)',
			fontSize: text.px13,
		},
		legend: {
			color: 'var(--color-text-soft)',
			fontSize: text.px12,
		},
		/**
		 * The corner every dot in this widget shares -- the legend's, the tooltip's, and the two
		 * in the table. Each is sized and placed differently and each is drawn the same, so the
		 * one declaration they have in common is written once.
		 */
		dot: {
			borderRadius: '0.125rem',
		},
		footerRight: {
			fontSize: text.px12,
		},
		/** A label beside a figure, quieter than the figure it introduces. */
		muted: {
			color: 'var(--color-text-soft)',
		},
		links: {
			fontSize: text.px11,
		},
		/**
		 * A tile, which is an anchor. It draws no ring of its own: the rule in the block below
		 * puts one on the rect inside it instead, where it reads against the treemap rather than
		 * against the page. The three longhands are `outline: none` written out, because an
		 * omitted longhand is not its initial value -- the shorthand leaves `currentColor` and
		 * `medium` behind it. See spec/architecture/css/migration.md.
		 */
		tile: {
			outlineStyle: 'none',
			outlineWidth: 'medium',
			outlineColor: 'currentColor',
		},
		/**
		 * One of the three registry links in the footer.
		 *
		 * One property transitions, so the four lists are single-item and `transition-behavior` is
		 * left to the initial value the shorthand also set. See spec/todo/todo.md, "A `transition`
		 * shorthand sets five lists and the migrated form writes three".
		 */
		link: {
			color: {
				default: 'var(--color-text-soft)',
				':hover': 'var(--color-text-strong)',
			},
			transitionProperty: {
				default: 'color',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '140ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: 'ease',
			transitionDelay: '0s',
		},
		table: {
			color: 'var(--color-text-strong)',
			fontSize: text.px13,
		},
		/** A column heading, put back to the body weight a `th` would otherwise render bold at. */
		tableHead: {
			borderBottomWidth: border.hairlineRem,
			borderBottomStyle: 'solid',
			borderBottomColor: 'var(--color-border)',
			color: 'var(--color-text-soft)',
			fontSize: text.px12,
			fontWeight: weight.normal,
		},
		/** A body cell, whose rule is half the width of the heading's and is not a named hairline. */
		tableCell: {
			borderBottomWidth: '0.03125rem',
			borderBottomStyle: 'solid',
			borderBottomColor: 'var(--color-border)',
		},
		tooltip: {
			borderWidth: border.hairlineRem,
			borderStyle: 'solid',
			borderColor: 'var(--color-border)',
			borderRadius: radius.md,
			backgroundColor: 'var(--color-paper)',
			color: 'var(--color-text)',
			fontSize: text.px12,
			lineHeight: line.snug,
		},
		tooltipTitle: {
			fontWeight: weight.strong,
		},
		tooltipCount: {
			color: 'var(--color-text-soft)',
			fontFamily: family.monoSpelled,
			fontSize: text.px11,
		},
		tooltipGrid: {
			fontFamily: family.monoSpelled,
			fontSize: text.px11,
		},
		/**
		 * The crate name in the table. Its `text-align` is a utility on the cell rather than a key
		 * here -- text behaviour is the frame -- and it no longer overrides anything: the `td`
		 * rule it used to fight moved to the markup with it, so each cell now carries the one
		 * alignment it wants. See spec/architecture/css/layers.md, "Typography splits".
		 */
		nameCell: {
			fontWeight: weight.medium,
		},
		optional: {
			color: 'var(--color-text-soft)',
			fontSize: text.px10,
		},
	});
</script>

<script lang="ts">
	import './palette.css';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { URLS } from '@canmi/urls';
	import { hierarchy, treemap, treemapBinary } from 'd3-hierarchy';
	import { remFromMeasuredPixels } from '@canmi/units';
	import {
		KIND_COLORS,
		crateColors,
		dependencyItems,
		formatBytes,
		kindColor,
		type DependencyItem,
	} from './cargo';
	import type { CargoView, CrateDep, CrateRecord } from '@canmi/artifacts/types';

	let { crate, view = 'treemap' }: { crate: CrateRecord; view?: CargoView } = $props();
	let chart = $state<HTMLDivElement>();
	let tip = $state<{ x: number; y: number; dep: CrateDep }>();

	const items = $derived(dependencyItems(crate.deps));
	const colors = $derived(crateColors(crate.deps));
	const direct = $derived(crate.deps.filter((dep) => dep.depth === 0).length);
	const features = $derived(Object.keys(crate.features).length);
	const sorted = $derived(items.toSorted((a, b) => (b.dep.size ?? 0) - (a.dep.size ?? 0)));

	const WIDTH = 700;
	const HEIGHT = 420;
	const clipPrefix = $derived(`cargo-${crate.name.replace(/[^a-z0-9_-]/gi, '-')}`);
	type Tile = DependencyItem & { x: number; y: number; width: number; height: number };
	const tiles: Tile[] = $derived.by(() => {
		const sized = items.filter(({ dep }) => (dep.size ?? 0) > 0);
		if (sized.length === 0) return [];
		type Node = { children?: DependencyItem[] };
		const root = hierarchy<Node>({ children: sized })
			.sum((node) => (node as unknown as DependencyItem).dep?.size ?? 0)
			// oxlint-disable-next-line unicorn/no-array-sort -- d3 hierarchy requires in-place ordering
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
		const laid = treemap<Node>().tile(treemapBinary).size([WIDTH, HEIGHT]).padding(2).round(true)(
			root,
		);
		return laid.leaves().map((leaf) => {
			const item = leaf.data as unknown as DependencyItem;
			return {
				dep: item.dep,
				key: item.key,
				x: leaf.x0,
				y: leaf.y0,
				width: leaf.x1 - leaf.x0,
				height: leaf.y1 - leaf.y0,
			};
		});
	});

	function pointerTip(event: PointerEvent, dep: CrateDep) {
		if (!chart) return;
		const bounds = chart.getBoundingClientRect();
		tip = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, dep };
	}

	function focusTip(event: FocusEvent, dep: CrateDep) {
		if (!chart || !(event.currentTarget instanceof SVGElement)) return;
		const bounds = chart.getBoundingClientRect();
		const tile = event.currentTarget.getBoundingClientRect();
		tip = {
			x: tile.left + tile.width / 2 - bounds.left,
			y: tile.top + tile.height / 2 - bounds.top,
			dep,
		};
	}
</script>

<!-- `cargo-widget` carries no rule here and is not dead: it is the hook `palette.css` hangs the
     twenty-five crate colours and the four kind colours off, and that file is a component-local
     mirror this layer does not own. See spec/architecture/css/authoring.md, "Colour is never
     retyped", and spec/styling/controls.md. -->
<div class="cargo-widget my-[1.8em]">
	<div class="min-h-[3.75rem]">
		{#if view === 'table'}
			<div class="overflow-x-auto">
				<table class="w-full border-collapse {stylex.attrs(styles.table).class}">
					<thead>
						<tr>
							<th class="p-1.5 text-left {stylex.attrs(styles.tableHead).class}">Crate</th>
							<th class="p-1.5 text-right {stylex.attrs(styles.tableHead).class}">Version</th>
							<th class="p-1.5 text-right {stylex.attrs(styles.tableHead).class}">Kind</th>
							<th class="p-1.5 text-right {stylex.attrs(styles.tableHead).class}">Depth</th>
							<th class="p-1.5 text-right {stylex.attrs(styles.tableHead).class}">Size</th>
						</tr>
					</thead>
					<tbody>
						{#each sorted as item (item.key)}
							<tr>
								<td
									class="p-1.5 text-left whitespace-nowrap {stylex.attrs(
										styles.tableCell,
										styles.nameCell,
									).class}"
								>
									<span
										class="mr-[0.3125rem] inline-block size-2 align-middle {stylex.attrs(styles.dot)
											.class}"
										style="background: {colors.get(item.dep.name) ?? '#888'}"
										aria-hidden="true"
									></span>
									{item.dep.name}
									{#if item.dep.optional}<span class="ml-1 {stylex.attrs(styles.optional).class}"
											>opt</span
										>{/if}
								</td>
								<td class="p-1.5 text-right {stylex.attrs(styles.tableCell).class}"
									>{item.dep.version}</td
								>
								<td class="p-1.5 text-right {stylex.attrs(styles.tableCell).class}">
									<span
										class="mr-[0.1875rem] inline-block size-1.5 align-middle {stylex.attrs(
											styles.dot,
										).class}"
										style="background: {kindColor(item.dep)}"
										aria-hidden="true"
									></span>
									{item.dep.kind}
								</td>
								<td class="p-1.5 text-right {stylex.attrs(styles.tableCell).class}"
									>{item.dep.depth === 0 ? 'direct' : item.dep.depth}</td
								>
								<td class="p-1.5 text-right {stylex.attrs(styles.tableCell).class}"
									>{item.dep.size == null ? '-' : formatBytes(item.dep.size)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if tiles.length === 0}
			<p class="m-0 {stylex.attrs(styles.empty).class}">No dependency size data available.</p>
		{:else}
			<div
				bind:this={chart}
				class="relative"
				role="presentation"
				onpointerleave={() => (tip = undefined)}
			>
				<svg
					class="block h-auto w-full"
					viewBox="0 0 {WIDTH} {HEIGHT}"
					role="img"
					aria-label="{crate.name} {crate.version}: {crate.deps.length} dependencies, {formatBytes(
						crate.total_dep_size,
					)} in total"
				>
					<defs>
						{#each tiles as tile, index (tile.key)}
							<clipPath id="{clipPrefix}-{index}">
								<rect
									x={tile.x + 5}
									y={tile.y}
									width={Math.max(0, tile.width - 10)}
									height={tile.height}
								/>
							</clipPath>
						{/each}
					</defs>
					{#each tiles as tile, index (tile.key)}
						<a
							class="cargo-tile {stylex.attrs(styles.tile).class}"
							href="{URLS.external.registries.cargo}/crates/{tile.dep.name}/{tile.dep.version}"
							target="_blank"
							rel="noopener"
							aria-label="{tile.dep.name} {tile.dep.version}, {tile.dep.depth === 0
								? 'direct'
								: `transitive depth ${tile.dep.depth}`}, {formatBytes(tile.dep.size ?? 0)}"
							onpointerenter={(event) => pointerTip(event, tile.dep)}
							onpointermove={(event) => pointerTip(event, tile.dep)}
							onfocus={(event) => focusTip(event, tile.dep)}
							onblur={() => (tip = undefined)}
						>
							<rect
								x={tile.x}
								y={tile.y}
								width={tile.width}
								height={tile.height}
								fill={colors.get(tile.dep.name) ?? '#888'}
								opacity={tile.dep.depth === 0 ? 0.88 : 0.65}
								rx={Math.min(4, Math.min(tile.width, tile.height) * 0.3)}
							/>
							{#if tile.dep.optional && tile.width > 6 && tile.height > 6}
								<rect
									x={tile.x + 0.5}
									y={tile.y + 0.5}
									width={tile.width - 1}
									height={tile.height - 1}
									fill="none"
									stroke="rgba(255,255,255,0.4)"
									stroke-dasharray="3 2"
									rx={Math.min(4, Math.min(tile.width, tile.height) * 0.3)}
								/>
							{/if}
							<!-- The words on a tile are out of the pointer's way: the anchor underneath
							     them is what takes the hover. -->
							{#if tile.width > 58 && tile.height > 28}
								<text
									x={tile.x + 5}
									y={tile.y + 15}
									class="tile-name pointer-events-none {stylex.attrs(styles.tileName).class}"
									clip-path="url(#{clipPrefix}-{index})">{tile.dep.name}</text
								>
								{#if tile.height > 38}
									<text
										x={tile.x + 5}
										y={tile.y + 28}
										class="tile-size pointer-events-none {stylex.attrs(styles.tileSize).class}"
										clip-path="url(#{clipPrefix}-{index})">{formatBytes(tile.dep.size ?? 0)}</text
									>
								{/if}
							{/if}
						</a>
					{/each}
				</svg>

				<!-- The tooltip follows the pointer, so it must never be under it. -->
				{#if tip}
					<div
						class="pointer-events-none absolute z-10 max-w-[16.25rem] min-w-[11.25rem] px-[0.55rem] py-[0.4rem] shadow-sm {stylex.attrs(
							styles.tooltip,
						).class}"
						style="left: calc({remFromMeasuredPixels(
							tip.x,
						)} + 1rem); top: calc({remFromMeasuredPixels(tip.y)} + 1rem)"
					>
						<div class="mb-[0.3rem] flex items-center gap-[0.3rem]">
							<span
								class="size-2 shrink-0 {stylex.attrs(styles.dot).class}"
								style="background: {kindColor(tip.dep)}"
								aria-hidden="true"
							></span>
							<span class={stylex.attrs(styles.tooltipTitle).class}>{tip.dep.name}</span>
							<span class="ml-auto {stylex.attrs(styles.tooltipCount).class}"
								>{tip.dep.version}</span
							>
						</div>
						<div
							class="tooltip-grid grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0 {stylex.attrs(
								styles.tooltipGrid,
							).class}"
						>
							<span class={stylex.attrs(styles.muted).class}>Kind</span>
							<span>{tip.dep.kind}{tip.dep.optional ? ' (optional)' : ''}</span>
							<span class={stylex.attrs(styles.muted).class}>Size</span>
							<span>{tip.dep.size == null ? 'unknown' : formatBytes(tip.dep.size)}</span>
							<span class={stylex.attrs(styles.muted).class}>Depth</span>
							<span>{tip.dep.depth === 0 ? 'direct' : `transitive (${tip.dep.depth})`}</span>
							{#if tip.dep.target}
								<span class={stylex.attrs(styles.muted).class}>Target</span>
								<span>{tip.dep.target}</span>
							{/if}
							{#if tip.dep.features.length > 0}
								<span class={stylex.attrs(styles.muted).class}>Features</span>
								<span
									>{tip.dep.features.length <= 3
										? tip.dep.features.join(', ')
										: `${tip.dep.features.slice(0, 3).join(', ')} +${tip.dep.features.length - 3}`}</span
								>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
		<div class="flex gap-3 {stylex.attrs(styles.legend).class}" aria-label="Dependency kinds">
			{#each Object.entries(KIND_COLORS) as [kind, color] (kind)}
				<span class="flex items-center gap-1">
					<span
						class="inline-block size-2.5 {stylex.attrs(styles.dot).class}"
						style="background: {color}"
						aria-hidden="true"
					></span>
					{kind.charAt(0).toUpperCase() + kind.slice(1)}
				</span>
			{/each}
		</div>
		<!-- The figures fold away on a narrow screen, and the query is written out rather than taken
		     from the `max-` variant: that one compiles to a condition that stops one pixel short of
		     where this rule stopped. See spec/architecture/css/migration.md, "A name that promises a
		     translation is where the value changes". -->
		<div
			class="flex items-center gap-[0.65rem] whitespace-nowrap [@media(max-width:40rem)]:hidden {stylex.attrs(
				styles.footerRight,
			).class}"
		>
			{#if features > 0}<span
					><span class={stylex.attrs(styles.muted).class}>Features</span>
					<b class={stylex.attrs(surfaces.heading).class}>{features}</b></span
				>{/if}
			<span
				><span class={stylex.attrs(styles.muted).class}>Deps</span>
				<b class={stylex.attrs(surfaces.heading).class}>{direct}+{crate.deps.length - direct}</b
				></span
			>
			<span
				><span class={stylex.attrs(styles.muted).class}>Size</span>
				<b class={stylex.attrs(surfaces.heading).class}>{formatBytes(crate.total_dep_size)}</b
				></span
			>
			<span class="flex gap-2 {stylex.attrs(styles.links).class}">
				{#each [[`${URLS.external.registries.cargo}/crates/${crate.name}`, 'crates.io'], [`${URLS.external.rust.lib}/crates/${crate.name}`, 'lib.rs'], [`${URLS.external.rust.docs}/${crate.name}`, 'docs.rs']] as [href, label] (label)}
					<a
						class="focus-link no-underline inline-flex items-center gap-[0.0625rem] {stylex.attrs(
							styles.link,
						).class}"
						{href}
						target="_blank"
						rel="noopener"
					>
						{label}<ArrowUpRight class="size-2.5" strokeWidth={2} aria-hidden="true" />
					</a>
				{/each}
			</span>
		</div>
	</div>
</div>

<style>
	/* The ring a focused tile draws, which is on the rect inside the anchor rather than on the
	   anchor: a child selected through its parent's state, which no class reaches. The white is
	   the treemap's own, read against whichever palette colour the tile drew -- see
	   spec/styling/controls.md. */
	.cargo-tile:focus-visible rect:first-child {
		stroke: white;
		stroke-width: 2;
	}
	/* The values against their labels. Counted rather than named, so no class reaches them. */
	.tooltip-grid > :nth-child(even) {
		overflow-wrap: anywhere;
		text-align: right;
	}
</style>

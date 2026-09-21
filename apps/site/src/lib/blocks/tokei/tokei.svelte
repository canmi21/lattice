<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { border, family, line, radius, text, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the Tokei figure. Every interface colour is the token variable
	 * `libs/tokens` already declares. See spec/architecture/css/authoring.md.
	 *
	 * Two exceptions stay put: the whites over a tile's own colour (spec/todo.md, "Tokei draws
	 * from a palette of its own, and it is the third one") and `shadow-sm` on the tooltip
	 * (spec/todo.md, "A shadow is one utility, two declarations and four variables the visual
	 * layer cannot restate").
	 */
	const styles = stylex.create({
		/** A treemap tile's language name, over the tile's own colour. */
		tileName: {
			fontSize: text.px12,
			fontWeight: weight.medium,
		},
		/** Its line count, a step quieter on the same ground. */
		tileSize: {
			fontSize: text.px10,
		},
		/** One of the bar chart's horizontal rules. */
		gridLine: {
			stroke: 'var(--color-border)',
			// A string rather than a number: SVG reads an unitless stroke width in user units,
			// and StyleX appends `px` to a number.
			strokeWidth: '1',
		},
		/** Every word the bar chart writes: the ticks, the totals and the language names. */
		axisLabel: {
			fill: 'var(--color-text-soft)',
			fontSize: text.px11,
		},
		legend: {
			color: 'var(--color-text-soft)',
			fontSize: text.px12,
		},
		summary: {
			fontSize: text.px12,
		},
		/** The quieter half of a labelled figure, in the summary and in the tooltip both. */
		muted: {
			color: 'var(--color-text-soft)',
		},
		/** The square of colour a legend entry and a nested language each put before their name. */
		swatch: {
			borderRadius: '0.125rem',
		},
		/**
		 * The link out to tokei itself, at the end of the summary row.
		 *
		 * One property transitions, so the four lists are single-item and `transition-behavior` is
		 * left to the initial value the shorthand also set. The reduced-motion branch is
		 * `transition: none` written out. See spec/todo.md, "A `transition` shorthand sets five
		 * lists and the migrated form writes three".
		 */
		summaryLink: {
			color: {
				default: 'var(--color-text-soft)',
				':hover': 'var(--color-text-strong)',
			},
			fontSize: text.px11,
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
		/** The panel that follows the pointer across the chart. */
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
		tooltipDot: {
			borderRadius: '0.125rem',
		},
		tooltipTitle: {
			fontWeight: weight.strong,
		},
		/**
		 * The line count beside it.
		 *
		 * The stack is a literal because the figures it sets are the chart's own rather than the
		 * site's prose, and it is written twice: the tooltip's grid sets the same one on its
		 * even children, which are counted rather than named and so stay in the block below.
		 */
		tooltipCount: {
			color: 'var(--color-text-soft)',
			fontFamily: family.monoSpelled,
			fontSize: text.px11,
		},
		tooltipBar: {
			borderRadius: '0.09375rem',
		},
		tooltipGrid: {
			fontSize: text.px11,
		},
		/**
		 * The smallest type the figure writes: a percentage beside a count in the tooltip grid, and
		 * a nested language's line total. One key rather than two because the two rules it replaces
		 * declared the same pair character for character.
		 */
		micro: {
			color: 'var(--color-text-soft)',
			fontSize: text.px10,
		},
		nested: {
			borderTopWidth: border.hairlineRem,
			borderTopStyle: 'solid',
			borderTopColor: 'var(--color-border)',
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
		languageCell: {
			fontWeight: weight.medium,
		},
		languageDot: {
			borderRadius: '0.125rem',
		},
		breakdown: {
			borderRadius: '0.1875rem',
		},
	});
</script>

<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { hierarchy, treemap } from 'd3-hierarchy';
	import { remFromMeasuredPixels } from '$lib/client/units';
	import { URLS } from '@canmi/urls';
	import { langColor, parseTokei, type LangStat } from './tokei';
	import type { TokeiView } from '@canmi/artifacts/types';
	import { compactCount } from '$lib/format';

	let {
		source,
		title,
		view = 'treemap',
	}: { source: string; title: string; view?: TokeiView } = $props();
	let chart = $state<HTMLDivElement>();
	let tip = $state<{ x: number; y: number; stat: LangStat }>();

	const stats = $derived(parseTokei(source));
	const sorted = $derived(stats.toSorted((a, b) => b.lines - a.lines));
	const totals = $derived(
		stats.reduce(
			(sum, stat) => ({
				files: sum.files + stat.files,
				lines: sum.lines + stat.lines,
				code: sum.code + stat.code,
				comments: sum.comments + stat.comments,
				blanks: sum.blanks + stat.blanks,
			}),
			{ files: 0, lines: 0, code: 0, comments: 0, blanks: 0 },
		),
	);

	const FUNCTION_COLORS = {
		code: '#3178c6',
		comments: '#7c6ede',
		blanks: '#b0ada6',
	} as const;

	const TREE_WIDTH = 700;
	const TREE_HEIGHT = 420;
	const clipPrefix = 'tokei-language';
	type TreeTile = { stat: LangStat; x: number; y: number; width: number; height: number };
	const treeTiles: TreeTile[] = $derived.by(() => {
		if (sorted.length === 0) return [];
		type Node = { children?: LangStat[] };
		const root = hierarchy<Node>({ children: sorted })
			.sum((node) => (node as unknown as LangStat).lines ?? 0)
			// oxlint-disable-next-line unicorn/no-array-sort -- d3 hierarchy requires in-place ordering
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
		const laid = treemap<Node>().size([TREE_WIDTH, TREE_HEIGHT]).padding(2).round(true)(root);
		return laid.leaves().map((leaf) => ({
			stat: leaf.data as unknown as LangStat,
			x: leaf.x0,
			y: leaf.y0,
			width: leaf.x1 - leaf.x0,
			height: leaf.y1 - leaf.y0,
		}));
	});

	const BAR_WIDTH = 700;
	const BAR_HEIGHT = 400;
	const BAR_MARGIN = { top: 20, right: 20, bottom: 90, left: 55 };
	const barInnerWidth = BAR_WIDTH - BAR_MARGIN.left - BAR_MARGIN.right;
	const barInnerHeight = BAR_HEIGHT - BAR_MARGIN.top - BAR_MARGIN.bottom;
	const maxLines = $derived(Math.max(0, ...sorted.map((stat) => stat.lines)));
	const barStep = $derived(sorted.length === 0 ? 0 : barInnerWidth / sorted.length);
	const barWidth = $derived(barStep * 0.75);
	const y = (value: number) =>
		maxLines === 0 ? barInnerHeight : barInnerHeight - (value / maxLines) * barInnerHeight;
	const ticks = $derived(Array.from({ length: 6 }, (_, index) => (maxLines * index) / 5));

	function percent(part: number, total: number): number {
		return total === 0 ? 0 : Math.round((part / total) * 100);
	}

	function pointerTip(event: PointerEvent, stat: LangStat) {
		if (!chart) return;
		const bounds = chart.getBoundingClientRect();
		tip = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, stat };
	}
</script>

{#if stats.length > 0}
	<div class="my-[1.8em]">
		<div class="min-h-[6.25rem]">
			{#if view === 'table'}
				<div class="overflow-x-auto">
					<table class="w-full border-collapse {stylex.attrs(styles.table).class}">
						<thead>
							<tr>
								<th class="px-1.5 py-2 text-left {stylex.attrs(styles.tableHead).class}"
									>Language</th
								>
								<th class="px-1.5 py-2 text-right {stylex.attrs(styles.tableHead).class}">Files</th>
								<th class="px-1.5 py-2 text-right {stylex.attrs(styles.tableHead).class}">Lines</th>
								<th class="px-1.5 py-2 text-right {stylex.attrs(styles.tableHead).class}">Code</th>
								<th class="px-1.5 py-2 text-right {stylex.attrs(styles.tableHead).class}"
									>Comments</th
								>
								<th class="px-1.5 py-2 text-right {stylex.attrs(styles.tableHead).class}">Blanks</th
								>
								<th
									class="min-w-[7.5rem] px-1.5 py-2 text-left {stylex.attrs(styles.tableHead)
										.class}">Breakdown</th
								>
							</tr>
						</thead>
						<tbody>
							{#each sorted as stat (stat.lang)}
								<tr>
									<td
										class="px-1.5 py-2 text-left whitespace-nowrap {stylex.attrs(
											styles.tableCell,
											styles.languageCell,
										).class}"
									>
										<span
											class="mr-1.5 inline-block size-2.5 align-middle {stylex.attrs(
												styles.languageDot,
											).class}"
											style="background: {langColor(stat.lang)}"
											aria-hidden="true"
										></span>
										{stat.lang}
									</td>
									<td class="px-1.5 py-2 text-right {stylex.attrs(styles.tableCell).class}"
										>{stat.files.toLocaleString('en-US')}</td
									>
									<td
										class="px-1.5 py-2 text-right {stylex.attrs(styles.tableCell).class}"
										title={stat.lines.toLocaleString('en-US')}>{compactCount(stat.lines)}</td
									>
									<td
										class="px-1.5 py-2 text-right {stylex.attrs(styles.tableCell).class}"
										title={stat.code.toLocaleString('en-US')}>{compactCount(stat.code)}</td
									>
									<td
										class="px-1.5 py-2 text-right {stylex.attrs(styles.tableCell).class}"
										title={stat.comments.toLocaleString('en-US')}>{compactCount(stat.comments)}</td
									>
									<td
										class="px-1.5 py-2 text-right {stylex.attrs(styles.tableCell).class}"
										title={stat.blanks.toLocaleString('en-US')}>{compactCount(stat.blanks)}</td
									>
									<td class="px-1.5 py-2 text-right {stylex.attrs(styles.tableCell).class}">
										<div
											class="flex h-3.5 min-w-[6.25rem] overflow-hidden {stylex.attrs(
												styles.breakdown,
											).class}"
											aria-label="{percent(stat.code, stat.lines)}% code, {percent(
												stat.comments,
												stat.lines,
											)}% comments"
										>
											<span
												style="width: {percent(
													stat.code,
													stat.lines,
												)}%; background: {FUNCTION_COLORS.code}"
											></span>
											<span
												style="width: {percent(
													stat.comments,
													stat.lines,
												)}%; background: {FUNCTION_COLORS.comments}"
											></span>
											<span
												style="width: {Math.max(
													0,
													100 - percent(stat.code, stat.lines) - percent(stat.comments, stat.lines),
												)}%; background: {FUNCTION_COLORS.blanks}"
											></span>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div
					bind:this={chart}
					class="relative"
					role="presentation"
					onpointerleave={() => (tip = undefined)}
				>
					{#if view === 'bar'}
						<svg
							class="block h-auto w-full"
							viewBox="0 0 {BAR_WIDTH} {BAR_HEIGHT}"
							role="img"
							aria-label="{title}: lines by language"
						>
							<g transform="translate({BAR_MARGIN.left} {BAR_MARGIN.top})">
								{#each ticks as tick (tick)}
									{@const tickY = y(tick)}
									<line
										x1="0"
										x2={barInnerWidth}
										y1={tickY}
										y2={tickY}
										class="grid-line {stylex.attrs(styles.gridLine).class}"
									/>
									<text
										x="-8"
										y={tickY + 4}
										text-anchor="end"
										class="axis-label {stylex.attrs(styles.axisLabel).class}"
										>{compactCount(tick)}</text
									>
								{/each}
								{#each sorted as stat, index (stat.lang)}
									{@const barX = index * barStep + (barStep - barWidth) / 2}
									{@const codeHeight = maxLines === 0 ? 0 : (stat.code / maxLines) * barInnerHeight}
									{@const commentHeight =
										maxLines === 0 ? 0 : (stat.comments / maxLines) * barInnerHeight}
									{@const blankHeight =
										maxLines === 0 ? 0 : (stat.blanks / maxLines) * barInnerHeight}
									<g
										role="img"
										aria-label="{stat.lang}: {stat.lines.toLocaleString('en-US')} lines"
										onpointerenter={(event) => pointerTip(event, stat)}
										onpointermove={(event) => pointerTip(event, stat)}
									>
										<rect
											x={barX}
											y={barInnerHeight - codeHeight}
											width={barWidth}
											height={codeHeight}
											fill={FUNCTION_COLORS.code}
											rx="1"
										/>
										<rect
											x={barX}
											y={barInnerHeight - codeHeight - commentHeight}
											width={barWidth}
											height={commentHeight}
											fill={FUNCTION_COLORS.comments}
											rx="1"
										/>
										<rect
											x={barX}
											y={barInnerHeight - codeHeight - commentHeight - blankHeight}
											width={barWidth}
											height={blankHeight}
											fill={FUNCTION_COLORS.blanks}
											rx="1"
										/>
										{#if stat.lines >= 800}
											<text
												x={barX + barWidth / 2}
												y={y(stat.lines) - 5}
												text-anchor="middle"
												class="axis-label {stylex.attrs(styles.axisLabel).class}"
												>{compactCount(stat.lines)}</text
											>
										{/if}
									</g>
									<text
										transform="translate({barX + barWidth / 2} {barInnerHeight + 10}) rotate(-45)"
										text-anchor="end"
										class="axis-label {stylex.attrs(styles.axisLabel).class}">{stat.lang}</text
									>
								{/each}
							</g>
						</svg>
					{:else}
						<svg
							class="block h-auto w-full"
							viewBox="0 0 {TREE_WIDTH} {TREE_HEIGHT}"
							role="img"
							aria-label="{title}: {stats.length} languages, {totals.lines.toLocaleString(
								'en-US',
							)} lines"
						>
							<defs>
								{#each treeTiles as tile, index (tile.stat.lang)}
									<clipPath id="{clipPrefix}-{index}">
										<rect
											x={tile.x + 6}
											y={tile.y}
											width={Math.max(0, tile.width - 18)}
											height={tile.height}
										/>
									</clipPath>
								{/each}
							</defs>
							{#each treeTiles as tile, index (tile.stat.lang)}
								<g
									role="img"
									aria-label="{tile.stat.lang}: {tile.stat.lines.toLocaleString('en-US')} lines"
									onpointerenter={(event) => pointerTip(event, tile.stat)}
									onpointermove={(event) => pointerTip(event, tile.stat)}
								>
									<rect
										x={tile.x}
										y={tile.y}
										width={tile.width}
										height={tile.height}
										fill={langColor(tile.stat.lang)}
										opacity="0.82"
										rx={Math.min(4, Math.min(tile.width, tile.height) * 0.3)}
									/>
									{#if tile.width > 64 && tile.height > 30}
										<text
											x={tile.x + 6}
											y={tile.y + 16}
											class="tile-name pointer-events-none {stylex.attrs(styles.tileName).class}"
											clip-path="url(#{clipPrefix}-{index})">{tile.stat.lang}</text
										>
										{#if tile.height > 40}<text
												x={tile.x + 6}
												y={tile.y + 28}
												class="tile-size pointer-events-none {stylex.attrs(styles.tileSize).class}"
												clip-path="url(#{clipPrefix}-{index})"
												>{compactCount(tile.stat.lines)} lines</text
											>{/if}
									{/if}
									{#if tile.width > 8 && tile.height > 30}
										<rect
											x={tile.x + tile.width - 8}
											y={tile.y + 4}
											width="4"
											height={tile.height - 8}
											fill="rgba(0,0,0,0.15)"
											rx="2"
										/>
										<rect
											x={tile.x + tile.width - 8}
											y={tile.y + 4}
											width="4"
											height={Math.max(1, (tile.height - 8) * (tile.stat.code / tile.stat.lines))}
											fill="rgba(255,255,255,0.6)"
											rx="2"
										/>
									{/if}
								</g>
							{/each}
						</svg>
					{/if}

					{#if tip}
						{@const codePercent = percent(tip.stat.code, tip.stat.lines)}
						{@const commentPercent = percent(tip.stat.comments, tip.stat.lines)}
						{@const blankPercent = Math.max(0, 100 - codePercent - commentPercent)}
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
									class="size-2 shrink-0 {stylex.attrs(styles.tooltipDot).class}"
									style="background: {langColor(tip.stat.lang)}"
									aria-hidden="true"
								></span>
								<span class={stylex.attrs(styles.tooltipTitle).class}>{tip.stat.lang}</span>
								<span class="ml-auto {stylex.attrs(styles.tooltipCount).class}"
									>{tip.stat.lines.toLocaleString('en-US')} lines</span
								>
							</div>
							<div
								class="mb-[0.3rem] flex h-[0.1875rem] overflow-hidden {stylex.attrs(
									styles.tooltipBar,
								).class}"
							>
								<span style="width: {codePercent}%; background: {FUNCTION_COLORS.code}"></span>
								<span style="width: {commentPercent}%; background: {FUNCTION_COLORS.comments}"
								></span>
								<span style="width: {blankPercent}%; background: {FUNCTION_COLORS.blanks}"></span>
							</div>
							<div
								class="tooltip-grid grid grid-cols-[auto_1fr] gap-x-2 gap-y-0 {stylex.attrs(
									styles.tooltipGrid,
								).class}"
							>
								<span class={stylex.attrs(styles.muted).class}>Files</span><span
									>{tip.stat.files.toLocaleString('en-US')}</span
								>
								<span style="color: {FUNCTION_COLORS.code}">Code</span><span
									>{tip.stat.code.toLocaleString('en-US')}
									<small class={stylex.attrs(styles.micro).class}>{codePercent}%</small></span
								>
								<span style="color: {FUNCTION_COLORS.comments}">Comments</span><span
									>{tip.stat.comments.toLocaleString('en-US')}
									<small class={stylex.attrs(styles.micro).class}>{commentPercent}%</small></span
								>
								<span style="color: {FUNCTION_COLORS.blanks}">Blanks</span><span
									>{tip.stat.blanks.toLocaleString('en-US')}
									<small class={stylex.attrs(styles.micro).class}>{blankPercent}%</small></span
								>
							</div>
							{#if tip.stat.nested.length > 0}
								<div
									class="mt-1 flex flex-wrap gap-x-2 gap-y-[0.15rem] pt-1 {stylex.attrs(
										styles.nested,
									).class}"
								>
									{#each tip.stat.nested as nested (nested.lang)}
										<span
											class="inline-flex items-center gap-[0.2rem] whitespace-nowrap {stylex.attrs(
												styles.micro,
											).class}"
											><i
												class="inline-block size-1.5 {stylex.attrs(styles.swatch).class}"
												style="background: {langColor(nested.lang)}"
											></i>{nested.lang}
											{compactCount(nested.lines)}</span
										>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
			<div class="flex gap-3 {stylex.attrs(styles.legend).class}" aria-label="Line kinds">
				{#each Object.entries(FUNCTION_COLORS) as [kind, color] (kind)}
					<span class="flex items-center gap-1"
						><i
							class="inline-block size-2.5 {stylex.attrs(styles.swatch).class}"
							style="background: {color}"
							aria-hidden="true"
						></i>{kind.charAt(0).toUpperCase() + kind.slice(1)}</span
					>
				{/each}
			</div>
			<!-- The row folds away on a narrow screen, and the query is written out rather than taken
			     from the `max-` variant: that one compiles to `width < 40rem`, which stops one pixel
			     short of where this rule stopped. See spec/architecture/css/migration.md, "A name that
			     promises a translation is where the value changes". -->
			<div
				class="flex flex-wrap gap-x-4 gap-y-[0.4rem] [@media(max-width:40rem)]:hidden {stylex.attrs(
					styles.summary,
				).class}"
			>
				<span
					><span class={stylex.attrs(styles.muted).class}>Total files</span>
					<b class={stylex.attrs(surfaces.heading).class}>{compactCount(totals.files)}</b></span
				>
				<span
					><span class={stylex.attrs(styles.muted).class}>Total lines</span>
					<b class={stylex.attrs(surfaces.heading).class}>{compactCount(totals.lines)}</b></span
				>
				<span
					><span class={stylex.attrs(styles.muted).class}>Code lines</span>
					<b class={stylex.attrs(surfaces.heading).class}>{compactCount(totals.code)}</b></span
				>
				<span
					><span class={stylex.attrs(styles.muted).class}>Comment ratio</span>
					<b class={stylex.attrs(surfaces.heading).class}
						>{percent(totals.comments, totals.lines)}%</b
					></span
				>
				<a
					class="focus-link no-underline inline-flex items-center gap-[0.0625rem] {stylex.attrs(
						styles.summaryLink,
					).class}"
					href="{URLS.external.github.web}/XAMPPRocky/tokei"
					target="_blank"
					rel="noopener"
					>tokei<ArrowUpRight class="size-2.5" strokeWidth={2} aria-hidden="true" /></a
				>
			</div>
		</div>
	</div>
{/if}

<style>
	/* The chart's own palette rather than the site's, so it stays out of the visual layer. See
	   spec/todo.md. */
	.tile-name {
		fill: white;
	}
	.tile-size {
		fill: rgb(255 255 255 / 75%);
	}
	/* The figures against their labels. Counted rather than named, so no class reaches them and
	   this is the one rule in the tooltip a layer above could not have written. The stack is the
	   chart's own rather than the site's prose, and `tooltipCount` above sets the same one. */
	.tooltip-grid > :nth-child(even) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		text-align: right;
	}
</style>

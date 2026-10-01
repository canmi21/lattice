<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, figures, radius, text, weight } from '@canmi/tokens/vocabulary.stylex';
	import type { State } from '$lib/board';

	/** The board's recipes. See spec/styling/palettes.md. */
	const styles = stylex.create({
		title: {
			fontSize: 'clamp(2.5rem, 7vw, 4rem)', // unnamed
			lineHeight: 1.125,
			fontWeight: 590, // unnamed
			letterSpacing: '-0.015625em', // unnamed
			color: 'var(--color-text-strong)',
			textWrap: 'balance',
		},
		action: {
			fontSize: text.px14,
			fontWeight: 510, // unnamed
			borderRadius: radius.full,
		},
		primary: {
			color: 'var(--color-paper)',
			backgroundColor: {
				default: 'var(--color-ink)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
			},
		},
		secondary: {
			color: 'var(--color-text)',
			backgroundColor: {
				default: 'color-mix(in oklch, var(--color-text) 6%, transparent)',
				'@media (hover: hover)': {
					default: null,
					':hover': 'color-mix(in oklch, var(--color-text) 10%, transparent)',
				},
			},
		},
		kind: {
			fontSize: text.px15,
			fontWeight: weight.semibold,
			color: 'var(--color-text-strong)',
		},
		card: {
			backgroundColor: 'color-mix(in oklch, var(--color-text) 4%, transparent)',
			borderRadius: '1.5rem', // unnamed
		},
		row: {
			borderTopWidth: border.hairlinePx,
			borderTopStyle: 'solid',
			borderTopColor: {
				default: 'color-mix(in oklch, var(--color-text) 6%, transparent)',
				':first-child': 'transparent',
			},
		},
		name: {
			fontSize: text.px14,
			fontWeight: weight.medium,
			color: 'var(--color-text-strong)',
		},
		figure: {
			fontSize: text.px13,
			fontVariantNumeric: figures.tabular,
			color: 'var(--color-text-soft)',
		},
		up: { backgroundColor: 'var(--color-green)' },
		down: { backgroundColor: 'var(--color-red)' },
		quiet: { backgroundColor: 'var(--color-border-strong)' },
		switch: {
			backgroundColor: 'color-mix(in oklch, var(--color-text) 4%, transparent)',
			borderRadius: radius.full,
		},
		option: {
			fontSize: text.px13,
			fontWeight: weight.medium,
			borderRadius: radius.full,
			color: {
				default: 'var(--color-text-soft)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
			},
		},
		chosen: {
			color: 'var(--color-text-strong)',
			backgroundColor: 'var(--color-paper)',
			boxShadow: '0 1px 2px color-mix(in oklch, var(--color-text) 10%, transparent)',
		},
		bar: { borderRadius: radius.full },
		none: { backgroundColor: 'var(--color-border)' },
	});

	/** The dot's colour for a check's state. */
	function dot(state: State) {
		return state === 'up' ? styles.up : state === 'down' ? styles.down : styles.quiet;
	}

	/**
	 * How many days a row shows at each width: bars keep their size, and the board steps its width
	 * with the count. `shown` shows a figure for its span only.
	 */
	const SPANS = [
		{ days: 30, shown: 'md:hidden' },
		{ days: 60, shown: 'hidden md:inline min-[67.5rem]:hidden' },
		{ days: 90, shown: 'hidden min-[67.5rem]:inline' },
	] as const;

	/** A bar's visibility by its index among the ninety, oldest first. */
	function barShown(index: number): string {
		if (index < 30) return 'hidden min-[67.5rem]:block';
		if (index < 60) return 'hidden md:block';
		return '';
	}

	const KIND_NAMES: Record<string, string> = {
		health: 'Services',
		api: 'APIs',
		dns: 'Names',
		page: 'Pages',
	};
</script>

<script lang="ts">
	import Title from '@canmi/behavior/title.svelte';
	import { ldJson, person } from '@canmi/social/structured';
	import { URLS } from '@canmi/urls';
	import Bell from 'phosphor-svelte/lib/Bell';
	import WarningCircle from 'phosphor-svelte/lib/WarningCircle';
	import { onMount, untrack } from 'svelte';
	import {
		byKind,
		dayColor,
		daysOf,
		key,
		overallOf,
		segmentsOf,
		stateOf,
		todayOf,
		uptimeOf,
	} from '$lib/board';
	import { Live } from '$lib/live.svelte';
	import { barsOf, RANGES, type Range, sinceLabel, SPAN } from '$lib/ranges';
	import { ago, percent } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** The page's name, and what it is for a first load. See spec/architecture/titles.md. */
	const NAME = 'Canmi Status';
	const DESCRIPTION = 'Live uptime of the services I run, checked from outside every few seconds.';
	const CANONICAL = new URL('/', URLS.internal.status.canonical).href;
	const website = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: NAME,
		description: DESCRIPTION,
		url: CANONICAL,
		author: person(),
	};

	// Seeded once from the server's answer.
	const live = new Live(untrack(() => data));

	// On mount, not in an effect: an effect reruns on what start() reads, reopening the socket.
	onMount(() => live.start());

	/** Show `range`, and keep it in the address so a link shows the same. */
	function choose(range: Range) {
		void live.setRange(range);
		const url = new URL(window.location.href);
		if (range === 'days') url.searchParams.delete('range');
		else url.searchParams.set('range', range);
		history.replaceState(history.state, '', url);
	}

	const overall = $derived(overallOf(live.checks, live.nowByKey, live.clock));
	const groups = $derived(byKind(live.checks));

	/**
	 * Four states: all up; minor; severe -- the probe silent, or at least two checks and a quarter
	 * of them failing or quiet; no data yet.
	 */
	const title = $derived.by((): [string, string] => {
		switch (overall.state) {
			case 'empty':
				return ['Awaiting the probe,', 'shortly.'];
			case 'up':
				return ['All systems up,', 'all clear.'];
			case 'silent':
				return ['Something is down,', 'no reports.'];
		}
		const affected = overall.state === 'down' ? overall.failing : overall.silent;
		const severe = affected >= 2 && affected * 4 >= overall.total;
		return severe
			? ['Something is down,', `${affected} affected.`]
			: ['Minor issues found,', `${affected} affected.`];
	});

	const updated = $derived(
		live.answeredAt ? `Updated ${ago(live.answeredAt, live.clock)}` : 'Not reached yet',
	);
</script>

<Title full="{NAME} - Is everything up right now" short={NAME} />

<svelte:head>
	<meta name="description" content={DESCRIPTION} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={NAME} />
	<meta property="og:title" content="{NAME} - Is everything up right now" />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:url" content={CANONICAL} />
	<meta name="twitter:card" content="summary" />
	<!-- Safe despite the raw insertion: ldJson escapes what it serialises. -->
	{@html ldJson(website)}
</svelte:head>

<header class="flex flex-col items-center pt-20 pb-16 text-center">
	<h1 class={stylex.attrs(styles.title).class}>{title[0]}<br />{title[1]}</h1>
	<div class="mt-6 flex flex-wrap justify-center gap-4">
		<button
			type="button"
			class="focus-ring inline-flex h-10 items-center gap-1 px-4 {stylex.attrs(
				styles.action,
				styles.primary,
			).class}"
		>
			<WarningCircle size={18} weight="bold" aria-hidden="true" />
			Report a problem
		</button>
		<button
			type="button"
			class="focus-ring inline-flex h-10 items-center gap-1 px-4 {stylex.attrs(
				styles.action,
				styles.secondary,
			).class}"
		>
			<Bell size={18} weight="bold" aria-hidden="true" />
			Subscribe
		</button>
	</div>
</header>

<div class="mx-auto flex w-full flex-col gap-12 md:w-[697px] min-[67.5rem]:w-[1027px]">
	<div class="-mb-6 flex justify-start md:justify-end">
		<div
			role="radiogroup"
			aria-label="Each bar spans"
			class="flex gap-1 p-1 {stylex.attrs(styles.switch).class}"
		>
			{#each RANGES as range (range)}
				<button
					type="button"
					role="radio"
					aria-checked={live.range === range}
					onclick={() => choose(range)}
					class="focus-ring h-7 px-3 {stylex.attrs(
						styles.option,
						live.range === range && styles.chosen,
					).class}"
				>
					{SPAN[range].label}
				</button>
			{/each}
		</div>
	</div>
	{#each groups as [kind, checks], order (kind)}
		<section>
			<div class="mb-4 flex items-baseline justify-between gap-4 px-1">
				<h2 class={stylex.attrs(styles.kind).class}>{KIND_NAMES[kind] ?? kind}</h2>
				{#if order === 0}
					<span class={stylex.attrs(styles.figure).class}>{updated}</span>
				{/if}
			</div>
			<ul class="px-2.5 py-2 md:px-5 {stylex.attrs(styles.card).class}">
				{#each checks as check (key(check.id, check.place))}
					{@const latest = live.nowByKey.get(key(check.id, check.place))}
					{@const state = stateOf(latest, live.clock)}
					{@const recent = segmentsOf(live.historyOf(check), live.clock)}
					{@const days =
						live.range === 'days'
							? daysOf(live.dailyOf(check), todayOf(recent, live.clock), live.clock)
							: barsOf(live.range, live.rangeOf(check), live.clock)}
					{@const shown = SPANS.map((span) => uptimeOf(days.slice(-span.days)))}
					<li class="py-5 {stylex.attrs(styles.row).class}">
						<div class="flex items-center justify-between gap-4">
							<div class="flex min-w-0 items-center gap-2.5">
								<span class="size-2 shrink-0 rounded-full {stylex.attrs(dot(state)).class}"></span>
								<span class="truncate {stylex.attrs(styles.name).class}">{check.name}</span>
							</div>
							{#each SPANS as span, index (span.days)}
								<span class="shrink-0 {span.shown} {stylex.attrs(styles.figure).class}">
									{shown[index] === null ? 'No data' : percent(shown[index]!)}
								</span>
							{/each}
						</div>
						<div class="mt-3 flex h-8 items-stretch justify-end gap-[2px] md:gap-[3px]">
							{#each days as day, index (day.start)}
								{@const color = dayColor(day, check.intervalSeconds, SPAN[live.range].unit)}
								<span
									class="min-w-0 flex-1 md:w-2 md:flex-none {barShown(index)} {stylex.attrs(
										styles.bar,
										color === null && styles.none,
									).class}"
									style:background-color={color}
								></span>
							{/each}
						</div>
					</li>
				{/each}
			</ul>
			<div class="mt-3 flex justify-between px-2.5 md:px-5 {stylex.attrs(styles.figure).class}">
				{#each SPANS as span (span.days)}
					<span class={span.shown}>{sinceLabel(live.range, span.days)}</span>
				{/each}
				<span>{live.range === 'days' ? 'Today' : 'Now'}</span>
			</div>
		</section>
	{/each}
</div>

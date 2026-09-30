<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, figures, radius, text, weight } from '@canmi/tokens/vocabulary.stylex';
	import type { SegmentState, State } from '$lib/board';

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
		subtitle: {
			fontSize: '1rem',
			lineHeight: 1.5,
			color: 'var(--color-text-soft)',
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
		bar: { borderRadius: radius.full },
		partial: { backgroundColor: 'var(--color-red)', opacity: 0.45 },
		none: { backgroundColor: 'var(--color-border)' },
	});

	/** The dot's colour for a check's state. */
	function dot(state: State) {
		return state === 'up' ? styles.up : state === 'down' ? styles.down : styles.quiet;
	}

	/** A bar segment's colour for its half-hour. */
	function fill(state: SegmentState) {
		switch (state) {
			case 'up':
				return styles.up;
			case 'down':
				return styles.down;
			case 'partial':
				return styles.partial;
			case 'none':
				return styles.none;
		}
	}

	const KIND_NAMES: Record<string, string> = {
		health: 'Services',
		api: 'APIs',
		dns: 'Names',
		page: 'Pages',
	};
</script>

<script lang="ts">
	import Bell from '@lucide/svelte/icons/bell';
	import MessageCircleWarning from '@lucide/svelte/icons/message-circle-warning';
	import { onMount, untrack } from 'svelte';
	import {
		byKind,
		daysOf,
		key,
		overallOf,
		segmentsOf,
		stateOf,
		todayOf,
		uptimeOf,
	} from '$lib/board';
	import { Live } from '$lib/live.svelte';
	import { ago, percent } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Seeded once from the server's answer.
	const live = new Live(untrack(() => data));

	// On mount, not in an effect: an effect reruns on what start() reads, reopening the socket.
	onMount(() => live.start());

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

	const subtitle = $derived(
		live.answeredAt ? `Updated ${ago(live.answeredAt, live.clock)}.` : 'Not reached yet.',
	);
</script>

<svelte:head>
	<title>Status</title>
	<meta
		name="description"
		content="Whether the platform's services, APIs, names and pages are answering, checked from outside every few seconds."
	/>
</svelte:head>

<header class="flex flex-col items-center pt-20 pb-16 text-center">
	<h1 class={stylex.attrs(styles.title).class}>{title[0]}<br />{title[1]}</h1>
	<p class="mt-2 {stylex.attrs(styles.subtitle).class}">{subtitle}</p>
	<div class="mt-4 flex flex-wrap justify-center gap-4">
		<button
			type="button"
			class="focus-ring inline-flex h-10 items-center gap-1 px-4 {stylex.attrs(
				styles.action,
				styles.primary,
			).class}"
		>
			<MessageCircleWarning size={18} aria-hidden="true" />
			Report a problem
		</button>
		<button
			type="button"
			class="focus-ring inline-flex h-10 items-center gap-1 px-4 {stylex.attrs(
				styles.action,
				styles.secondary,
			).class}"
		>
			<Bell size={18} aria-hidden="true" />
			Subscribe
		</button>
	</div>
</header>

<div class="flex flex-col gap-12">
	{#each groups as [kind, checks] (kind)}
		<section>
			<h2 class="mb-4 px-1 {stylex.attrs(styles.kind).class}">{KIND_NAMES[kind] ?? kind}</h2>
			<ul class="px-6 py-2 {stylex.attrs(styles.card).class}">
				{#each checks as check (key(check.id, check.place))}
					{@const latest = live.nowByKey.get(key(check.id, check.place))}
					{@const state = stateOf(latest, live.clock)}
					{@const recent = segmentsOf(live.historyOf(check), live.clock)}
					{@const days = daysOf(live.dailyOf(check), todayOf(recent, live.clock), live.clock)}
					{@const uptime = uptimeOf(days)}
					<li class="py-5 {stylex.attrs(styles.row).class}">
						<div class="flex items-center justify-between gap-4">
							<div class="flex min-w-0 items-center gap-2.5">
								<span class="size-2 shrink-0 rounded-full {stylex.attrs(dot(state)).class}"></span>
								<span class="truncate {stylex.attrs(styles.name).class}">{check.name}</span>
							</div>
							<span class="shrink-0 {stylex.attrs(styles.figure).class}">
								{uptime === null ? 'No data' : percent(uptime)}
							</span>
						</div>
						<div class="mt-3 flex h-8 items-stretch gap-[3px]">
							{#each days as day (day.start)}
								<span class="min-w-0 flex-1 {stylex.attrs(styles.bar, fill(day.state)).class}"
								></span>
							{/each}
						</div>
					</li>
				{/each}
			</ul>
			<div class="mt-3 flex justify-between px-6 {stylex.attrs(styles.figure).class}">
				<span>90 days ago</span>
				<span>Today</span>
			</div>
		</section>
	{/each}
</div>

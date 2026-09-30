<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { border, figures, radius, text, weight } from '@canmi/tokens/vocabulary.stylex';
	import type { SegmentState, State } from '$lib/board';

	/** The board's recipes. See spec/styling/palettes.md. */
	const styles = stylex.create({
		headline: {
			fontSize: '1.5rem', // unnamed
			fontWeight: weight.semibold,
			letterSpacing: '-0.02em', // unnamed
			color: 'var(--color-text-strong)',
		},
		lede: {
			fontSize: text.px14,
			color: 'var(--color-text-soft)',
		},
		kind: {
			fontSize: text.px13,
			fontWeight: weight.medium,
			color: 'var(--color-text-muted)',
		},
		card: {
			backgroundColor: 'var(--color-paper)',
			borderWidth: border.hairlinePx,
			borderStyle: 'solid',
			borderColor: 'var(--color-border)',
			borderRadius: radius.lg,
		},
		row: {
			borderTopWidth: border.hairlinePx,
			borderTopStyle: 'solid',
			borderTopColor: {
				default: 'var(--color-border)',
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
		segment: { borderRadius: '1px' }, // unnamed
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
	import { onMount, untrack } from 'svelte';
	import { byKind, key, overallOf, segmentsOf, stateOf, uptimeOf } from '$lib/board';
	import { Live } from '$lib/live.svelte';
	import { percent } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Seeded once from the server's answer.
	const live = new Live(untrack(() => data));

	// On mount, not in an effect: an effect reruns on what start() reads, reopening the socket.
	onMount(() => live.start());

	const overall = $derived(overallOf(live.checks, live.nowByKey, live.clock));
	const groups = $derived(byKind(live.checks));

	const headline = $derived.by(() => {
		switch (overall.state) {
			case 'up':
				return 'All checks passing';
			case 'down':
				return `${overall.failing} of ${overall.total} checks failing`;
			case 'partial':
				return `${overall.silent} of ${overall.total} checks gone quiet`;
			case 'silent':
				return 'The probe is silent';
			case 'empty':
				return 'No checks reported yet';
		}
	});
	const headlineDot = $derived(
		overall.state === 'up' ? styles.up : overall.state === 'down' ? styles.down : styles.quiet,
	);
</script>

<svelte:head>
	<title>Status</title>
	<meta
		name="description"
		content="Whether the platform's services, APIs, names and pages are answering, checked from outside every few seconds."
	/>
</svelte:head>

<header class="mb-12">
	<div class="flex items-center gap-3">
		<span class="size-2.5 shrink-0 rounded-full {stylex.attrs(headlineDot).class}"></span>
		<h1 class={stylex.attrs(styles.headline).class}>{headline}</h1>
	</div>
	<p class="mt-2 {stylex.attrs(styles.lede).class}">
		Checked from outside every few seconds, and told to this page as it happens.
	</p>
</header>

<div class="flex flex-col gap-10">
	{#each groups as [kind, checks] (kind)}
		<section>
			<h2 class="mb-3 {stylex.attrs(styles.kind).class}">{KIND_NAMES[kind] ?? kind}</h2>
			<ul class={stylex.attrs(styles.card).class}>
				{#each checks as check (key(check.id, check.place))}
					{@const latest = live.nowByKey.get(key(check.id, check.place))}
					{@const state = stateOf(latest, live.clock)}
					{@const segments = segmentsOf(live.historyOf(check), live.clock)}
					{@const uptime = uptimeOf(segments)}
					<li class="px-5 py-4 {stylex.attrs(styles.row).class}">
						<div class="flex items-center justify-between gap-4">
							<div class="flex min-w-0 items-center gap-2.5">
								<span class="size-2 shrink-0 rounded-full {stylex.attrs(dot(state)).class}"></span>
								<span class="truncate {stylex.attrs(styles.name).class}">{check.id}</span>
							</div>
							<span class="shrink-0 {stylex.attrs(styles.figure).class}">
								{latest ? `${latest.durationMs} ms` : '--'}
							</span>
						</div>
						<div class="mt-3 flex h-6 gap-[2px]">
							{#each segments as segment (segment.start)}
								<span class="flex-1 {stylex.attrs(styles.segment, fill(segment.state)).class}"
								></span>
							{/each}
						</div>
						<div class="mt-2 flex justify-between {stylex.attrs(styles.figure).class}">
							<span>24 hours ago</span>
							<span>{uptime === null ? 'No data' : `${percent(uptime)} uptime`}</span>
							<span>Now</span>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

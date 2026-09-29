<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import {
		border,
		duration,
		easing,
		family,
		figures,
		leading,
		radius,
		text,
		weight,
	} from '@canmi/tokens/vocabulary.stylex';

	/**
	 * The visual half of one check. Colours are palette names, read rather than retyped, and the
	 * accents appear only where they say a state. See spec/architecture/css/authoring.md.
	 */
	const styles = stylex.create({
		// The interface's own step, fourteen pixels on a twenty-pixel line.
		ui: { fontSize: text.px14, lineHeight: leading.px20 },
		// The list's rule between rows, and none above the first: the card draws that edge.
		row: {
			borderTopWidth: { default: border.hairlinePx, ':first-child': '0' },
			borderTopStyle: 'solid',
			borderTopColor: 'var(--color-border)',
		},
		id: {
			color: 'var(--color-text-strong)',
			fontWeight: weight.medium,
			fontFamily: family.monoTheme,
			fontSize: text.px13,
			lineHeight: leading.px20,
		},
		target: {
			color: 'var(--color-text-soft)',
			fontFamily: family.monoTheme,
			fontSize: text.px12,
			lineHeight: leading.px16,
		},
		latency: {
			color: 'var(--color-text-soft)',
			fontFamily: family.monoTheme,
			fontSize: text.px12,
			lineHeight: leading.px16,
			fontVariantNumeric: figures.tabular,
		},
		state: {
			color: 'var(--color-text-muted)',
			fontWeight: weight.medium,
			transitionProperty: 'color',
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: easing.inOut,
		},
		failing: { color: 'var(--color-red)' },
		dot: {
			borderRadius: radius.full,
			transitionProperty: 'background-color',
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: easing.inOut,
		},
		up: { backgroundColor: 'var(--color-green)' },
		down: { backgroundColor: 'var(--color-red)' },
		silent: { backgroundColor: 'var(--color-text-soft)' },
		unknown: { backgroundColor: 'var(--color-border-strong)' },
		detail: {
			color: 'var(--color-red)',
			fontFamily: family.monoTheme,
			fontSize: text.px12,
			lineHeight: leading.px16,
		},
	});
</script>

<script lang="ts">
	import type { StatusCheckRow, StatusNowRow } from '@canmi/status-schema';
	import { type State, segmentsOf, stateOf, uptimeOf } from '$lib/board';
	import { settle } from '$lib/motion';
	import type { HistoryRow } from '$lib/rows';
	import { ago } from '$lib/time';
	import UptimeBar from './uptime-bar.svelte';

	let {
		check,
		latest,
		history,
		clock,
		local,
	}: {
		check: StatusCheckRow;
		latest: StatusNowRow | undefined;
		history: HistoryRow[];
		clock: number;
		local: boolean;
	} = $props();

	const STATE: Record<State, string> = {
		up: 'Operational',
		down: 'Failing',
		silent: 'Probe silent',
		unknown: 'No data yet',
	};

	const state = $derived(stateOf(latest, clock));
	const segments = $derived(segmentsOf(history, clock));
	const uptime = $derived(uptimeOf(segments));
</script>

<li class="px-4 py-4 sm:px-5 {stylex.attrs(styles.row).class}">
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0">
			<h3 class={stylex.attrs(styles.id).class}>{check.id}</h3>
			<p class="truncate {stylex.attrs(styles.target).class}" title={check.target}>
				{check.target}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-3 {stylex.attrs(styles.ui).class}">
			{#if latest && state !== 'unknown'}
				<span class="whitespace-nowrap {stylex.attrs(styles.latency).class}">
					{#if state === 'silent'}
						last heard {ago(latest.at.getTime(), clock)}
					{:else}
						{latest.durationMs} ms
					{/if}
				</span>
			{/if}
			<span
				use:settle={state}
				class="inline-flex items-center gap-2 whitespace-nowrap {stylex.attrs(
					styles.state,
					state === 'down' && styles.failing,
				).class}"
			>
				<span class="size-1.5 {stylex.attrs(styles.dot, styles[state]).class}" aria-hidden="true"
				></span>
				{STATE[state]}
			</span>
		</div>
	</div>
	{#if state === 'down' && latest?.detail}
		<p class="mt-2 wrap-break-word {stylex.attrs(styles.detail).class}">{latest.detail}</p>
	{/if}
	<div class="mt-3.5">
		<UptimeBar {segments} {uptime} {local} />
	</div>
</li>

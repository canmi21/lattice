<script lang="ts">
	/**
	 * What happened, a line a run's app however many nodes it went to: a dot for how it went --
	 * green done, blue going, red failed -- the app by its name, a flag a country it went to,
	 * where it is or where it stopped, and how long ago, short. A line links to its run, or to its
	 * node's events where no run started it; a failure's reason is on its hover. With nothing to
	 * list, what there is not is said in the middle. See spec/console/overview.md, "What happened
	 * is one line a run's app".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { localTime } from '../format.ts';
	import Flag from '../map/flag.svelte';
	import { isoOf, nameOf } from '../map/places.ts';
	import { displayOf } from '../scope/scope.ts';
	import { scoped } from '../scope/context.ts';
	import { tone, type } from '../style.ts';
	import { timeZone } from '../ui/time-zone.ts';
	import type { Line } from './moving.ts';

	let {
		lines,
		now,
		empty,
		label,
		limit = 10,
	}: { lines: Line[]; now: number; empty: string; label: string; limit?: number } = $props();

	const { to, node: toNode } = scoped();
	const zone = timeZone();

	/** Flags drawn before the rest are counted. */
	const FLAGS = 3;
	const TONE = { running: 'busy', succeeded: 'good', failed: 'bad' } as const;

	const shown = $derived(lines.slice(0, limit));
	const hrefOf = (line: Line) =>
		line.run === undefined
			? `${toNode(line.nodes[0] ?? '')}?tab=events`
			: to(`/deployments/${line.run}`);
	/** How long ago, in its one largest unit and no space: `15m`, `8h`, `2d`. */
	function ago(stamp: string): string {
		const seconds = Math.max(0, (now - Date.parse(stamp)) / 1000);
		if (seconds < 60) return `${Math.round(seconds)}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
		if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
		return `${Math.floor(seconds / 86_400)}d`;
	}
	/** A flag a country, however many of its nodes a line went to; the rest are on the hover. */
	const countries = (line: Line) => [
		...new Map(line.nodes.map((code) => [isoOf(code) ?? code, code])).values(),
	];
	/** Every node it went to, by name, for the flags' hover. */
	const where = (line: Line) => line.nodes.map((code) => nameOf(code).full).join('\n');

	const styles = stylex.create({
		row: {
			backgroundColor: {
				default: 'transparent',
				':hover': 'color-mix(in srgb, var(--color-raised) 55%, transparent)',
			},
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		app: { color: 'var(--color-text)', fontSize: text.px13 },
		more: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		stage: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		time: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		empty: { color: 'var(--color-text-muted)', fontSize: text.px13 },
	});
</script>

{#if shown.length}
	<ul aria-label={label} class="-mx-2 flex flex-col">
		{#each shown as line (line.key)}
			{@const shade = TONE[line.outcome]}
			{@const flags = countries(line)}
			<li>
				<a
					href={hrefOf(line)}
					title={line.detail}
					class="grid h-7 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-2 {stylex.attrs(
						styles.row,
					).class}"
				>
					<span
						aria-hidden="true"
						class="size-1.5 rounded-full bg-current {stylex.attrs(tone[shade]).class}"
					></span>
					<span class="flex min-w-0 items-center gap-3">
						<span class="truncate {stylex.attrs(styles.app).class}">{displayOf(line.app)}</span>
						<span class="flex shrink-0 items-center gap-1" title={where(line)}>
							{#each flags.slice(0, FLAGS) as code (code)}
								<Flag {code} size={14} />
							{/each}
							{#if flags.length > FLAGS}
								<span class="ml-0.5 {stylex.attrs(type.shell, styles.more).class}"
									>+{flags.length - FLAGS}</span
								>
							{/if}
						</span>
					</span>
					<!-- Where it is, or where it stopped; a success says so by its dot alone. -->
					<span class={stylex.attrs(styles.stage, line.outcome === 'running' && tone.busy).class}
						>{line.outcome === 'succeeded' ? '' : (line.stage ?? '')}</span
					>
					<span class={stylex.attrs(type.shell, styles.time).class} title={localTime(line.at, zone)}
						>{ago(line.at)}</span
					>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<p class="flex min-h-40 flex-1 items-center justify-center {stylex.attrs(styles.empty).class}">
		{empty}
	</p>
{/if}

<script lang="ts">
	/**
	 * What happened, a line a run however many apps and nodes it went to: a dot for how it went --
	 * green done, blue going, red failed -- its apps by name, those that failed first, a flag a
	 * country it went to, where it is or where it stopped or else how long it took, the commit it
	 * built, and how long ago, short. A line links to its run, or to its node's events where no run
	 * started it; a failure's reason is on its hover. With nothing to list, what there is not is
	 * said in the middle. See spec/console/overview.md, "What happened is one line a run".
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
	/** Apps named before the rest are counted. */
	const APPS = 2;
	const TONE = { running: 'busy', succeeded: 'good', failed: 'bad' } as const;
	/**
	 * The dot, the apps, their flags, where it got to or how long it took, the commit, then what
	 * was done or why it failed in the room left, and when at the end.
	 */
	const COLUMNS =
		'grid grid-cols-[auto_minmax(0,11rem)_4.5rem_4.5rem_3.75rem_minmax(0,1fr)_2.25rem] items-center gap-x-3';

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
	/** How long it took, in its two largest units: `41s`, `3m 5s`, `1h 2m`, `1d 1h`. */
	function took(ms: number): string {
		const seconds = Math.round(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const [days, hours, minutes] = [
			Math.floor(seconds / 86_400),
			Math.floor((seconds % 86_400) / 3600),
			Math.floor((seconds % 3600) / 60),
		];
		if (days) return `${days}d ${hours}h`;
		if (hours) return `${hours}h ${minutes}m`;
		return `${minutes}m ${seconds % 60}s`;
	}
	/** A flag a country, however many of its nodes a line went to; the rest are on the hover. */
	const countries = (line: Line) => [
		...new Map(line.nodes.map((code) => [isoOf(code) ?? code, code])).values(),
	];
	/** Every node it went to, by name, for the flags' hover. */
	const where = (line: Line) => line.nodes.map((code) => nameOf(code).full).join('\n');

	const styles = stylex.create({
		row: {
			backgroundColor: { default: 'transparent', ':hover': 'var(--color-hover)' },
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		app: { color: 'var(--color-text)', fontSize: text.px13 },
		quiet: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		empty: { color: 'var(--color-text-muted)', fontSize: text.px13 },
	});
</script>

{#if shown.length}
	<ul aria-label={label} class="flex flex-col">
		{#each shown as line (line.key)}
			{@const flags = countries(line)}
			<li>
				<a
					href={hrefOf(line)}
					title={line.detail}
					class="h-7 rounded-md px-2 {COLUMNS} {stylex.attrs(styles.row).class}"
				>
					<span
						aria-hidden="true"
						class="size-1.5 rounded-full bg-current {stylex.attrs(tone[TONE[line.outcome]]).class}"
					></span>
					<span class="truncate {stylex.attrs(styles.app).class}">
						{line.apps.slice(0, APPS).map(displayOf).join(', ')}
						{#if line.apps.length > APPS}
							<span class={stylex.attrs(type.shell, styles.quiet).class}
								>+{line.apps.length - APPS}</span
							>
						{/if}
					</span>
					<span class="flex items-center gap-1" title={where(line)}>
						{#each flags.slice(0, FLAGS) as code (code)}
							<Flag {code} size={14} />
						{/each}
						{#if flags.length > FLAGS}
							<span class="ml-0.5 {stylex.attrs(type.shell, styles.quiet).class}"
								>+{flags.length - FLAGS}</span
							>
						{/if}
					</span>
					<!-- Where it is or where it stopped, a word; else how long it took, a figure. -->
					{#if line.outcome === 'succeeded'}
						<span class={stylex.attrs(type.shell, styles.quiet).class}
							>{line.duration === undefined ? '' : took(line.duration)}</span
						>
					{:else}
						<span
							class="truncate {stylex.attrs(styles.quiet, line.outcome === 'running' && tone.busy)
								.class}">{line.stage ?? ''}</span
						>
					{/if}
					<span class={stylex.attrs(type.shell, styles.quiet).class}
						>{line.commit?.slice(0, 7) ?? ''}</span
					>
					<span class="truncate {stylex.attrs(styles.quiet).class}"
						>{line.outcome === 'failed' ? (line.detail ?? '') : (line.what ?? '')}</span
					>
					<span
						class="text-right {stylex.attrs(type.shell, styles.quiet).class}"
						title={localTime(line.at, zone)}>{ago(line.at)}</span
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

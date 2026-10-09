<script lang="ts">
	/**
	 * The last day, a line a node: its flag and the part of its place that tells it apart, the
	 * steps it took as marks along the line -- a quiet tick done, a blue one going, a red dot
	 * failed -- and at the end how many of its apps are down. A run's marks stand one above
	 * another across the nodes, so a rollout reads down the card; pointing at one lights the rest
	 * of its run. In a view without nodes the lines are its busiest apps instead. See
	 * spec/console/overview.md, "The day is a line a node".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import { localTime } from '../format.ts';
	import type { Live } from '../live.svelte.ts';
	import Flag from '../map/flag.svelte';
	import { nameOf, partOf } from '../map/places.ts';
	import { stateOf } from '../node.ts';
	import { CODES } from '../nodes/facts.ts';
	import { scoped } from '../scope/context.ts';
	import { displayOf } from '../scope/scope.ts';
	import { tone, type } from '../style.ts';
	import { timeZone } from '../ui/time-zone.ts';
	import type { Step } from './moving.ts';
	import { type Mark, marks } from './timeline.ts';

	let {
		live,
		steps,
		keep,
		nodes = true,
	}: {
		live: Live;
		/** Every step known, history and live together. */
		steps: Step[];
		keep: (app: string) => boolean;
		/** A line a node; else a line an app, its busiest first. */
		nodes?: boolean;
	} = $props();

	const { to, node: toNode, app: toApp } = scoped();
	const zone = timeZone();

	/** Apps' lines at most, in a view without nodes. */
	const APPS = 8;
	/** Where the hours are marked along the line, as shares of the day, and what they say. */
	const HOURS = [
		[0, '24h'],
		[0.25, '18h'],
		[0.5, '12h'],
		[0.75, '6h'],
		[1, 'now'],
	] as const;
	const COLUMNS = 'grid grid-cols-[8.5rem_minmax(0,1fr)_4rem] items-center gap-x-4';

	const drawn = $derived(
		marks(
			steps.filter((step) => keep(step.app)),
			live.now,
		),
	);
	/** The run a pointer is on, whose marks on every line stand out. */
	let lit: number | undefined = $state();

	interface Line {
		key: string;
		href: string;
		marks: Mark[];
		/** Its apps that should run and do not, and those held stopped on purpose. */
		down: string[];
		held: string[];
		code?: string;
		label: string;
		/** The whole name, on the label's hover. */
		whole: string;
		state?: ReturnType<typeof stateOf>;
	}

	const lines = $derived.by((): Line[] => {
		if (nodes) {
			return CODES.map((code) => {
				const entry = live.view.nodes[code];
				const apps = (entry?.snapshot?.apps ?? []).filter((app) => keep(app.name) && !app.running);
				return {
					key: code,
					href: toNode(code),
					marks: drawn.filter((mark) => mark.node === code),
					down: apps.filter((app) => !app.held).map((app) => app.name),
					held: apps.filter((app) => app.held).map((app) => app.name),
					code,
					label: partOf(code),
					whole: nameOf(code).full,
					state: stateOf(entry, live.now),
				};
			});
		}
		const busiest = [...Map.groupBy(drawn, (mark) => mark.app)]
			.toSorted(([, a], [, b]) => b.length - a.length)
			.slice(0, APPS);
		return busiest.map(([app, its]) => ({
			key: app,
			href: toApp(app),
			marks: its,
			down: [],
			held: [],
			label: displayOf(app),
			whole: displayOf(app),
		}));
	});

	const WORD = { running: 'deploying', failed: 'failed', succeeded: 'deployed' } as const;
	/** How long it took, in its one largest unit: `42s`, `3m`, `2h`. */
	function took(mark: Mark): string {
		if (!mark.finished_at) return '';
		const seconds = Math.round((Date.parse(mark.finished_at) - Date.parse(mark.started_at)) / 1000);
		if (seconds < 60) return ` in ${seconds}s`;
		if (seconds < 3600) return ` in ${Math.round(seconds / 60)}m`;
		return ` in ${Math.round(seconds / 3600)}h`;
	}
	const said = (mark: Mark) =>
		`${displayOf(mark.app)} ${WORD[mark.outcome]} at ${localTime(mark.started_at, zone)}${took(mark)}` +
		(mark.detail ? `\n${mark.detail}` : '');
	const pct = (share: number) => `${(share * 100).toFixed(3)}%`;
	const LABEL_TONE = { gone: 'bad', upgrading: 'warn', restarting: 'warn' } as const;

	const styles = stylex.create({
		label: { color: 'var(--color-text)', fontSize: text.px13 },
		/** An hour's tick on the axis. */
		hour: { backgroundColor: 'var(--color-text-muted)' },
		/** The line itself, a hairline through the middle where the marks stand. */
		track: { backgroundColor: 'var(--color-line)' },
		done: { backgroundColor: 'color-mix(in srgb, var(--color-text) 55%, transparent)' },
		going: { backgroundColor: 'var(--color-busy)' },
		failed: { backgroundColor: 'var(--color-danger)', boxShadow: '0 0 0 2px var(--color-surface)' },
		/** Another run's marks step back while one is pointed at. */
		dim: { opacity: 0.25 },
		mark: { transitionProperty: 'opacity', transitionDuration: duration.base },
		down: { color: 'var(--color-danger)', fontSize: text.px12 },
		held: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		axis: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		empty: { color: 'var(--color-text-muted)', fontSize: text.px13 },
	});
</script>

{#snippet mark(one: Mark)}
	{@const faded = lit !== undefined && one.run !== lit}
	{@const href =
		one.run === undefined ? `${toNode(one.node)}?tab=events` : to(`/deployments/${one.run}`)}
	{#if one.outcome === 'failed'}
		<a
			{href}
			title={said(one)}
			class="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full {stylex.attrs(
				styles.mark,
				styles.failed,
				faded && styles.dim,
			).class}"
			style:left={pct(one.from)}
			style:z-index="2"
			onpointerenter={() => (lit = one.run)}
			onpointerleave={() => (lit = undefined)}
		></a>
	{:else}
		<!-- At least two pixels wide, so a deploy of a minute stands as a tick, and as long as it took
		     where that is longer. -->
		<a
			{href}
			title={said(one)}
			class="absolute top-1/2 h-3 min-w-0.5 -translate-y-1/2 rounded-[1px] {stylex.attrs(
				styles.mark,
				one.outcome === 'running' ? styles.going : styles.done,
				faded && styles.dim,
			).class}"
			style:left={pct(one.from)}
			style:width={pct(Math.max(0, one.to - one.from))}
			onpointerenter={() => (lit = one.run)}
			onpointerleave={() => (lit = undefined)}
		></a>
	{/if}
{/snippet}

{#if lines.length}
	<div class="flex flex-col">
		{#each lines as line (line.key)}
			<div class="h-7 {COLUMNS}">
				<a
					href={line.href}
					title={line.whole}
					class="flex min-w-0 items-center gap-2.5 {stylex.attrs(
						styles.label,
						line.state &&
							line.state in LABEL_TONE &&
							tone[LABEL_TONE[line.state as keyof typeof LABEL_TONE]],
					).class}"
				>
					{#if line.code}<Flag code={line.code} size={14} />{/if}
					<span class="truncate">{line.label}</span>
				</a>
				<div class="relative h-full">
					<span
						aria-hidden="true"
						class="absolute inset-x-0 top-1/2 h-px {stylex.attrs(styles.track).class}"
					></span>
					{#each line.marks as one (one.key)}
						{@render mark(one)}
					{/each}
				</div>
				<span class="text-right whitespace-nowrap">
					{#if line.down.length}
						<span
							class={stylex.attrs(type.shell, styles.down).class}
							title={[...line.down, ...line.held.map((app) => `${app} (held)`)]
								.map(displayOf)
								.join('\n')}>{line.down.length} down</span
						>
					{:else if line.held.length}
						<span
							class={stylex.attrs(type.shell, styles.held).class}
							title={line.held.map(displayOf).join('\n')}>{line.held.length} held</span
						>
					{/if}
				</span>
			</div>
		{/each}
		<!-- The hours, under the lines and in their column, the rules standing up through them. -->
		<div class="h-6 {COLUMNS}">
			<span></span>
			<div class="relative h-full">
				{#each HOURS as [at, word] (word)}
					<!-- The hour's tick on the axis alone: one standing through the lines read as a mark. -->
					<span
						aria-hidden="true"
						class="absolute top-0 h-1 w-px {stylex.attrs(styles.hour).class}"
						style:left={pct(at)}
					></span>
					<span
						class="absolute top-1 {at === 0
							? ''
							: at === 1
								? '-translate-x-full'
								: '-translate-x-1/2'} {stylex.attrs(type.shell, styles.axis).class}"
						style:left={pct(at)}>{word}</span
					>
				{/each}
			</div>
			<span></span>
		</div>
	</div>
{:else}
	<p class="flex min-h-40 items-center justify-center {stylex.attrs(styles.empty).class}">
		Nothing deployed in the last day
	</p>
{/if}

<script lang="ts">
	/**
	 * Steps as one line each: a dot for how it went, the app, the node, what it is doing or how it
	 * ended, and how long ago, each a link to its run, or to its node's events where no run started
	 * it. A failure's reason is on its hover, never written out. See spec/console/overview.md, "What
	 * happened is one line a step".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import AppName from '../apps/app-name.svelte';
	import { ago, localTime } from '../format.ts';
	import NodeName from '../nodes/node-name.svelte';
	import { scoped } from '../scope/context.ts';
	import { tone, type } from '../style.ts';
	import { timeZone } from '../ui/time-zone.ts';
	import type { Step } from './moving.ts';

	let { steps, now, empty, label }: { steps: Step[]; now: number; empty: string; label: string } =
		$props();

	const { to, node: toNode } = scoped();
	const zone = timeZone();

	const TONE: Record<string, keyof typeof tone> = {
		running: 'busy',
		succeeded: 'good',
		failed: 'bad',
	};
	const when = (step: Step) => step.finished_at ?? step.started_at;
	const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
	const hrefOf = (step: Step) =>
		step.run === undefined ? `${toNode(step.node)}?tab=events` : to(`/deployments/${step.run}`);
	/** What it is doing, or how it ended: its stage while it runs, where it stopped if it failed. */
	function wordOf(step: Step): string {
		if (step.outcome === 'running') return step.stage ? capital(step.stage) : 'Starting';
		if (step.outcome === 'failed') return step.stage ? `Failed while ${step.stage}` : 'Failed';
		return capital(step.outcome);
	}
	const keyOf = (step: Step) => `${step.run ?? step.source}/${step.node}/${step.app}`;

	const styles = stylex.create({
		row: {
			backgroundColor: {
				default: 'transparent',
				':hover': 'color-mix(in srgb, var(--color-raised) 55%, transparent)',
			},
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		node: { color: 'var(--color-text-muted)', fontSize: text.px13 },
		word: { fontSize: text.px13 },
		time: {
			color: 'var(--color-text-muted)',
			fontSize: text.px13,
			fontVariantNumeric: 'tabular-nums',
		},
	});
</script>

<ul aria-label={label} class="-mx-2 flex flex-col">
	{#each steps as step (keyOf(step))}
		{@const shade = TONE[step.outcome] ?? 'quiet'}
		<li>
			<a
				href={hrefOf(step)}
				title={step.detail}
				class="grid h-9 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-2 {stylex.attrs(
					styles.row,
				).class}"
			>
				<span
					aria-hidden="true"
					class="size-1.5 rounded-full bg-current {stylex.attrs(tone[shade]).class}"
				></span>
				<span class="flex min-w-0 items-baseline gap-2 truncate {stylex.attrs(type.body).class}">
					<AppName app={step.app} />
					<span class={stylex.attrs(styles.node).class}><NodeName code={step.node} short /></span>
				</span>
				<!-- The dot says it went well; only what is going or went wrong is said in color too. -->
				<span
					class="truncate {stylex.attrs(styles.word, tone[shade === 'good' ? 'quiet' : shade])
						.class}">{wordOf(step)}</span
				>
				<span class={stylex.attrs(styles.time).class} title={localTime(when(step), zone)}
					>{ago(when(step), now)}</span
				>
			</a>
		</li>
	{:else}
		<li class="px-2 py-2 {stylex.attrs(type.soft).class}">{empty}</li>
	{/each}
</ul>

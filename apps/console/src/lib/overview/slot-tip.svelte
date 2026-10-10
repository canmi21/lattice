<script lang="ts" module>
	import type { Verdict } from './history.ts';

	/** One thing a slot says, in a line: which, how it went, and a few words. */
	export interface Fact {
		what: 'deploys' | 'services' | 'connectivity';
		verdict: Verdict;
		words: string;
	}

	/** A slot's tip: the time it covers, what it says, and the runs in it where they are drawn. */
	export interface Tip {
		when: string;
		facts: Fact[];
		runs: { key: string; words: string; verdict: Verdict }[];
	}
</script>

<script lang="ts">
	/**
	 * What a pointed slot holds, in a card over it rather than the browser's title: the time it
	 * covers, then a line for each thing it says -- deploys, services, being heard -- each with its
	 * icon, a dot in its verdict's color and a few words, and the runs it holds where deploys are
	 * drawn. Placed above the slot, or under it near the window's top, and kept inside the window.
	 * See spec/console/overview.md, "A line is any of three things, or the worst of them".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import AccessPointIcon from '@tabler/icons-svelte-runes/icons/access-point';
	import PackagesIcon from '@tabler/icons-svelte-runes/icons/packages';
	import RocketIcon from '@tabler/icons-svelte-runes/icons/rocket';
	import Icon from '../design/icon.svelte';
	import { painted } from './verdict.ts';

	let { tip, at }: { tip: Tip; at: DOMRect } = $props();

	const ICONS = { deploys: RocketIcon, services: PackagesIcon, connectivity: AccessPointIcon };
	const NAMES = { deploys: 'Deploys', services: 'Services', connectivity: 'Connectivity' };

	/** How far it stands off the slot and the window's edges, in pixels. */
	const OFF = 8;
	let width = $state(0);
	let height = $state(0);
	const left = $derived(
		Math.max(OFF, Math.min(at.left + at.width / 2 - width / 2, innerWidth - width - OFF)),
	);
	/** Above the slot, unless that would reach under the top bar; then under it. */
	const top = $derived(at.top - height - OFF < 64 ? at.bottom + OFF : at.top - height - OFF);

	const styles = stylex.create({
		card: {
			backgroundColor: 'var(--color-surface)',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: 8,
			boxShadow: '0 8px 24px rgb(0 0 0 / 0.28)',
			fontSize: text.px12,
			lineHeight: 1.4,
			color: 'var(--color-text)',
		},
		when: { color: 'var(--color-text-muted)' },
		name: { color: 'var(--color-text-muted)' },
		words: { color: 'var(--color-text-strong)', fontWeight: weight.medium },
		quiet: { color: 'var(--color-text-muted)' },
		rule: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-line)' },
	});
</script>

<div
	role="tooltip"
	class="pointer-events-none fixed z-50 flex w-max max-w-72 flex-col gap-2 px-3 py-2.5 {stylex.attrs(
		styles.card,
	).class}"
	style:left="{left}px"
	style:top="{top}px"
	style:visibility={width ? 'visible' : 'hidden'}
	bind:clientWidth={width}
	bind:clientHeight={height}
>
	<span class={stylex.attrs(styles.when).class}>{tip.when}</span>
	<div class="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
		{#each tip.facts as fact (fact.what)}
			<Icon icon={ICONS[fact.what]} size={14} class={stylex.attrs(styles.name).class} />
			<span class={stylex.attrs(styles.name).class}>{NAMES[fact.what]}</span>
			<span class="flex min-w-0 items-center justify-end gap-1.5 text-right">
				<span
					class="truncate {stylex.attrs(fact.verdict === 'none' ? styles.quiet : styles.words)
						.class}">{fact.words}</span
				>
				<span class="size-1.5 shrink-0 rounded-full {stylex.attrs(painted[fact.verdict]).class}"
				></span>
			</span>
		{/each}
	</div>
	{#if tip.runs.length}
		<ul class="flex flex-col gap-1 pt-2 {stylex.attrs(styles.rule).class}">
			{#each tip.runs as run (run.key)}
				<li class="flex items-center gap-1.5">
					<span class="size-1.5 shrink-0 rounded-full {stylex.attrs(painted[run.verdict]).class}"
					></span>
					<span class="truncate">{run.words}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

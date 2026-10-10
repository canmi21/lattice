<script lang="ts" module>
	import type { Verdict } from './history.ts';

	/** One thing a slot says: which, its verdict, and that verdict's one word. */
	export interface Fact {
		what: 'deploys' | 'services' | 'connectivity';
		verdict: Verdict;
		word: string;
	}

	/** One thing in a slot worth naming -- an app down, a run -- and how long it took or lasted. */
	export interface Item {
		key: string;
		name: string;
		lasted: string;
		verdict: Verdict;
	}

	/** A slot's tip: when, said as the reader's clock says it, what it says, and what it holds. */
	export interface Tip {
		/** The time it begins, or its days: `9 PM`, `Oct 9`, `Oct 7 – 9`. */
		time: string;
		/** What the time leaves out, quieter: the day of an hour, the weekday of a day. */
		date?: string;
		facts: Fact[];
		items: Item[];
		/** Items past the few drawn. */
		more: number;
	}
</script>

<script lang="ts">
	/**
	 * What a pointed slot holds, in a card over it rather than the browser's title: when, a line
	 * for each thing it says -- an icon, a dot, one word -- and under a rule what it holds by name,
	 * how long each took or lasted aside. Placed above the slot, or under it near the window's
	 * top, and kept inside the window. See spec/console/overview.md, "A line is any of three
	 * things, or the worst of them".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import AccessPointIcon from '@tabler/icons-svelte-runes/icons/access-point';
	import PackagesIcon from '@tabler/icons-svelte-runes/icons/packages';
	import RocketIcon from '@tabler/icons-svelte-runes/icons/rocket';
	import Icon from '../design/icon.svelte';
	import { type } from '../style.ts';
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
		time: { color: 'var(--color-text-strong)', fontWeight: weight.semibold },
		muted: { color: 'var(--color-text-muted)' },
		word: { color: 'var(--color-text-strong)', fontWeight: weight.medium },
		rule: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-line)' },
	});
</script>

{#snippet dot(verdict: Verdict)}
	<span class="size-1.5 shrink-0 rounded-full {stylex.attrs(painted[verdict]).class}"></span>
{/snippet}

<div
	role="tooltip"
	class="pointer-events-none fixed z-50 flex w-max max-w-64 min-w-44 flex-col {stylex.attrs(
		styles.card,
	).class}"
	style:left="{left}px"
	style:top="{top}px"
	style:visibility={width ? 'visible' : 'hidden'}
	bind:clientWidth={width}
	bind:clientHeight={height}
>
	<!-- When, the time strong and what it leaves out quiet beside it. -->
	<div class="flex items-baseline justify-between gap-4 px-3 pt-2.5 pb-2">
		<span class={stylex.attrs(styles.time).class}>{tip.time}</span>
		{#if tip.date}<span class={stylex.attrs(styles.muted).class}>{tip.date}</span>{/if}
	</div>
	<div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3 pb-2.5">
		{#each tip.facts as fact (fact.what)}
			<Icon icon={ICONS[fact.what]} size={14} class={stylex.attrs(styles.muted).class} />
			<span class={stylex.attrs(styles.muted).class}>{NAMES[fact.what]}</span>
			<span class="flex items-center justify-end gap-1.5">
				<span class={stylex.attrs(fact.verdict === 'none' ? styles.muted : styles.word).class}
					>{fact.word}</span
				>
				{@render dot(fact.verdict)}
			</span>
		{/each}
	</div>
	{#if tip.items.length}
		<!-- What it holds by name, how long aside in the figures' face. -->
		<ul
			class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 pt-2 pb-2.5 {stylex.attrs(
				styles.rule,
			).class}"
		>
			{#each tip.items as item (item.key)}
				<li class="contents">
					{@render dot(item.verdict)}
					<span class="truncate">{item.name}</span>
					<span class="text-right {stylex.attrs(type.shell, styles.muted).class}"
						>{item.lasted}</span
					>
				</li>
			{/each}
			{#if tip.more}
				<li class="col-start-2 {stylex.attrs(styles.muted).class}">{tip.more} more</li>
			{/if}
		</ul>
	{/if}
</div>

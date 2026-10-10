<script lang="ts" module>
	import type { IconComponent } from '../design/optics.ts';
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
		/** What it is drawn with: the app's own icon, a run's rocket, the unheard's access point. */
		icon: IconComponent;
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
	 * What a pointed slot holds, in a card over it rather than the browser's title: when; a line for
	 * each thing it says -- its icon, how it is as a dot in the icon's corner, one word; and under a
	 * rule what it holds by icon and name, how long each took or lasted aside. Over the slot, or
	 * under it near the window's top, and inside the window. See spec/console/overview.md, "A line
	 * is any of three things, or the worst of them".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { text, weight } from '@canmi/kit/tokens/vocabulary.stylex';
	import AccessPointIcon from '@tabler/icons-svelte-runes/icons/access-point';
	import PackagesIcon from '@tabler/icons-svelte-runes/icons/packages';
	import RocketIcon from '@tabler/icons-svelte-runes/icons/rocket';
	import Icon from '../design/icon.svelte';
	import Point from '../design/point.svelte';
	import { type } from '../style.ts';
	import { painted } from './verdict.ts';

	let {
		tip,
		at,
		root = $bindable(),
		onleave,
	}: {
		tip: Tip;
		at: DOMRect;
		/** The tip itself, bridge and all, which the slot's leaving checks it went into. */
		root?: HTMLElement;
		onleave?: (event: PointerEvent) => void;
	} = $props();

	const ICONS = { deploys: RocketIcon, services: PackagesIcon, connectivity: AccessPointIcon };
	/** A verdict as the dot in an icon's corner; nothing to say draws none. */
	const badgeOf = (verdict: Verdict) =>
		verdict === 'none' ? undefined : stylex.attrs(painted[verdict]).class;
	const NAMES = { deploys: 'Deploys', services: 'Services', connectivity: 'Connectivity' };

	/**
	 * Its first and last words cut to their ink, cap height above and baseline below, so its edge
	 * reads as even on every side rather than gaining a line's leading at top and foot, as the
	 * map's card does. A browser without `text-box` keeps the leading.
	 */
	const START = '[text-box:trim-start_cap_alphabetic]';
	const END = '[text-box:trim-end_cap_alphabetic]';

	/** How far it stands off the window's edges, and off the slot past its point, in pixels. */
	const OFF = 8;
	const GAP = OFF + 7;
	/** How far its point stands out, half as far as it is wide. */
	const POINT = 7;

	/** How far the bridge to the slot reaches past the slot's sides, for a hand not quite true. */
	const BRIDGE = 2;
	/** How near a corner its point may come, past the card's rounding. */
	const INSET = 14;
	let width = $state(0);
	let height = $state(0);
	const left = $derived(
		Math.max(OFF, Math.min(at.left + at.width / 2 - width / 2, innerWidth - width - OFF)),
	);
	/** Above the slot, unless that would reach under the top bar; then under it. */
	const below = $derived(at.top - height - GAP < 64);
	const top = $derived(below ? at.bottom + GAP : at.top - height - GAP);
	/** Where along it the point stands: over the slot's middle, kept off the corners. */
	const point = $derived(Math.max(INSET, Math.min(at.left + at.width / 2 - left, width - INSET)));

	const styles = stylex.create({
		card: {
			backgroundColor: 'var(--color-surface)',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--color-line)',
			borderRadius: 8,
			// Its point lifted with it as one shape, as the map's card is.
			filter: 'drop-shadow(0 6px 14px rgb(0 0 0 / 0.22)) drop-shadow(0 1px 2px rgb(0 0 0 / 0.14))',
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

<div
	role="tooltip"
	bind:this={root}
	onpointerleave={onleave}
	class="fixed z-50 flex w-max max-w-64 min-w-44 flex-col {stylex.attrs(styles.card).class}"
	style:left="{left}px"
	style:top="{top}px"
	style:visibility={width ? 'visible' : 'hidden'}
	bind:clientWidth={width}
	bind:clientHeight={height}
>
	<Point card={root} edge={below ? 'top' : 'bottom'} along={point} size={POINT} />
	<!-- Unseen, the gap between it and its slot, as wide as the slot: the pointer crossing from
	     the one to the other never leaves them, so the tip need not wait to see if it returns. -->
	<span
		aria-hidden="true"
		class="absolute"
		style:left="{at.left - left - BRIDGE}px"
		style:width="{at.width + 2 * BRIDGE}px"
		style:height="{GAP + 1}px"
		style:top={below ? undefined : '100%'}
		style:bottom={below ? '100%' : undefined}
	></span>
	<!-- When, the time strong and what it leaves out quiet beside it. -->
	<div class="flex items-baseline justify-between gap-4 px-2 pt-2 pb-1.5">
		<span class="{START} {stylex.attrs(styles.time).class}">{tip.time}</span>
		{#if tip.date}<span class="{START} {stylex.attrs(styles.muted).class}">{tip.date}</span>{/if}
	</div>
	<!-- A mark and the words it marks a half step apart, everything else a whole step. -->
	<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-2 pb-2">
		{#each tip.facts as fact, index (fact.what)}
			{@const end = !tip.items.length && index === tip.facts.length - 1 ? END : ''}
			<span class="whitespace-nowrap {end} {stylex.attrs(styles.muted).class}"
				><Icon
					icon={ICONS[fact.what]}
					size={14}
					words={NAMES[fact.what]}
					badge={badgeOf(fact.verdict)}
					class="mr-1"
				/>{NAMES[fact.what]}</span
			>
			<span
				class="text-right whitespace-nowrap {end} {stylex.attrs(
					fact.verdict === 'none' ? styles.muted : styles.word,
				).class}">{fact.word}</span
			>
		{/each}
	</div>
	{#if tip.items.length}
		<!-- What it holds by name, how long aside in the figures' face. -->
		<ul
			class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-2 pt-1.5 pb-2 {stylex.attrs(
				styles.rule,
			).class}"
		>
			{#each tip.items as item, index (item.key)}
				{@const end = !tip.more && index === tip.items.length - 1 ? END : ''}
				<li class="contents">
					<!-- Cut across only: a descender below the trimmed foot stays drawn. -->
					<span class="min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap {end}"
						><Icon
							icon={item.icon}
							size={14}
							words={item.name}
							badge={badgeOf(item.verdict)}
							class="mr-1 {stylex.attrs(styles.muted).class}"
						/>{item.name}</span
					>
					<span class="text-right {end} {stylex.attrs(type.shell, styles.muted).class}"
						>{item.lasted}</span
					>
				</li>
			{/each}
			{#if tip.more}
				<li class="pl-[18px] {END} {stylex.attrs(styles.muted).class}">
					{tip.more} more
				</li>
			{/if}
		</ul>
	{/if}
</div>

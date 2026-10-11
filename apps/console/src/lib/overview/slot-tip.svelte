<script lang="ts" module>
	import type { IconComponent } from '@canmi/design/components/icon';
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
		/** Where the line names a node, its flag in the icon's place. */
		flag?: string;
		name: string;
		lasted: string;
		verdict: Verdict;
		/** Where it leads: the app's page, the run's, the node's events. */
		href?: string;
	}

	/** A slot's tip: when, said as the reader's clock says it, what it says, and what it holds. */
	export interface Tip {
		/** When it begins, its date first, or its days: `Oct 9, 9 PM`, `Oct 9`, `Oct 7 – 9`. */
		when: string;
		/** The zone `when` is written in, the reader's, quieter: `UTC-4`. */
		zone: string;
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
	import Icon from '@canmi/design/components/icon.svelte';
	import Bridge from '../design/bridge.svelte';
	import Point from '../design/point.svelte';
	import { heightBeside } from '@canmi/design/components/icon';
	import Flag from '../map/flag.svelte';
	import { type } from '../style.ts';
	import { painted } from './verdict.ts';

	let {
		tip,
		at,
		root = $bindable(),
		onleave,
		onpick,
	}: {
		tip: Tip;
		at: DOMRect;
		/** The tip itself, bridge and all, which the slot's leaving checks it went into. */
		root?: HTMLElement;
		onleave?: (event: PointerEvent) => void;
		/** Given where the tip says each of several things, a line chosen shows that one alone. */
		onpick?: (what: Fact['what']) => void;
	} = $props();

	/** Whether its last line is pointed at, which the point beside it is washed with. */
	let lastHeld = $state(false);
	/** Its rule as the browser drew it, snapped to device pixels; its last line rounds within. */
	let rule = $state(1);
	$effect(() => {
		if (root) rule = Number.parseFloat(getComputedStyle(root).borderTopWidth) || 1;
	});

	const ICONS = { deploys: RocketIcon, services: PackagesIcon, connectivity: AccessPointIcon };
	/** A verdict as the dot in an icon's corner; nothing to say is a grey one. */
	const badgeOf = (verdict: Verdict) =>
		stylex.attrs(verdict === 'none' ? styles.idle : painted[verdict]).class;
	const NAMES = { deploys: 'Deploys', services: 'Uptime', connectivity: 'Connectivity' };

	/**
	 * Its first and last words cut to their ink, cap height above and baseline below, so its edge
	 * reads as even on every side rather than gaining a line's leading at top and foot, as the
	 * map's card does. A browser without `text-box` keeps the leading.
	 */
	const START = '[text-box:trim-start_cap_alphabetic]';
	const END = '[text-box:trim-end_cap_alphabetic]';
	/**
	 * The last line's foot rounded as the card's is inside its rule, so its wash keeps to the card:
	 * the card cannot clip it, its point and bridge standing outside it.
	 */
	const FOOT = 'rounded-b-[calc(8px-var(--rule,1px))]';

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
		/** Nothing to say, as a dot: the muted ink, plain where a slot's grey would be too faint. */
		idle: { backgroundColor: 'var(--color-text-muted)' },
		word: { color: 'var(--color-text-strong)', fontWeight: weight.medium },
		rule: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-line)' },
		/** A line that leads somewhere, washed under the pointer the menus' one way, its dots' rings
		 * washed with it. */
		line: {
			backgroundColor: { default: 'transparent', ':hover': 'var(--color-selected)' },
			'--badge-ground': {
				default: 'var(--color-surface)',
				':hover': 'var(--color-selected-solid)',
			},
			cursor: 'pointer',
		},
	});
</script>

<!-- A node's flag where an icon would stand, set in its words by the same rule, its dot alike. -->
{#snippet flagged(code: string, verdict: Verdict, words: string)}
	<span
		class="relative mr-1 inline-flex size-[14px]"
		style:vertical-align="calc({heightBeside(words, 'before')} / 2 - 7px)"
	>
		<Flag {code} size={14} />
		<span
			aria-hidden="true"
			class="absolute -right-px -bottom-px size-1.5 rounded-full {badgeOf(verdict)}"
			style:box-shadow="0 0 0 1.5px var(--badge-ground, var(--color-surface))"
		></span>
	</span>
{/snippet}

<div
	role="tooltip"
	bind:this={root}
	onpointerleave={onleave}
	class="fixed z-50 flex w-max max-w-64 min-w-44 flex-col {stylex.attrs(styles.card).class}"
	style:--rule="{rule}px"
	style:left="{left}px"
	style:top="{top}px"
	style:visibility={width ? 'visible' : 'hidden'}
	bind:clientWidth={width}
	bind:clientHeight={height}
>
	<Point
		card={root}
		edge={below ? 'top' : 'bottom'}
		along={point}
		size={POINT}
		ground={lastHeld && !below ? 'var(--color-selected-solid)' : undefined}
	/>
	<!-- Unseen, the gap between it and its slot, as wide as the slot, on the side its point is. -->
	<Bridge
		edge={below ? 'top' : 'bottom'}
		along={at.left - left - BRIDGE}
		span={at.width + 2 * BRIDGE}
		reach={GAP + 1}
	/>
	<!-- When, its date first, strong; the zone it is written in quiet beside it. -->
	<div class="flex items-baseline justify-between gap-4 px-2 pt-2 pb-[3px]">
		<span class="whitespace-nowrap {START} {stylex.attrs(styles.time).class}">{tip.when}</span>
		<span class="{START} {stylex.attrs(styles.muted).class}">{tip.zone}</span>
	</div>
	<!-- Each line the tip's whole width, so the wash under the pointer runs edge to edge; the
	     space between two lines split between them, so their washes meet. -->
	{#snippet fact(one: Fact, last: boolean)}
		{@const end = last && !tip.items.length ? END : ''}
		<span class="whitespace-nowrap {end} {stylex.attrs(styles.muted).class}"
			><Icon
				icon={ICONS[one.what]}
				size={14}
				words={NAMES[one.what]}
				badge={badgeOf(one.verdict)}
				class="mr-1"
			/>{NAMES[one.what]}</span
		>
		<span
			class="text-right whitespace-nowrap {end} {stylex.attrs(
				one.verdict === 'none' ? styles.muted : styles.word,
			).class}">{one.word}</span
		>
	{/snippet}
	<div class="flex flex-col">
		{#each tip.facts as one, index (one.what)}
			{@const last = index === tip.facts.length - 1}
			{@const foot = last && !tip.items.length}
			{@const padding = `px-2 pt-[3px] ${last ? 'pb-2' : 'pb-[3px]'} ${foot ? FOOT : ''}`}
			{#if onpick}
				<!-- Chosen, the card shows this one alone and the tip goes. -->
				<button
					type="button"
					class="flex w-full items-center justify-between gap-2 text-left {padding} {stylex.attrs(
						styles.line,
					).class}"
					onclick={() => onpick(one.what)}
					onpointerenter={() => (lastHeld = last && !tip.items.length)}
					onpointerleave={() => (lastHeld = false)}
				>
					{@render fact(one, last)}
				</button>
			{:else}
				<div class="flex items-center justify-between gap-2 {padding}">
					{@render fact(one, last)}
				</div>
			{/if}
		{/each}
	</div>
	{#if tip.items.length}
		<!-- What it holds, each leading to its own page, how long aside in the figures' face. -->
		<ul class="flex flex-col {stylex.attrs(styles.rule).class}">
			{#each tip.items as item, index (item.key)}
				{@const last = !tip.more && index === tip.items.length - 1}
				{@const end = last ? END : ''}
				<li class="contents">
					<svelte:element
						this={item.href ? 'a' : 'div'}
						href={item.href}
						role={item.href ? undefined : 'presentation'}
						class="flex items-center justify-between gap-2 px-2 {index === 0
							? 'pt-1.5'
							: 'pt-0.5'} {last ? `pb-2 ${FOOT}` : 'pb-0.5'} {item.href
							? stylex.attrs(styles.line).class
							: ''}"
						onpointerenter={() => (lastHeld = last)}
						onpointerleave={() => (lastHeld = false)}
					>
						<!-- Cut across only: a descender below the trimmed foot stays drawn. -->
						<span class="min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap {end}"
							>{#if item.flag}{@render flagged(item.flag, item.verdict, item.name)}{:else}<Icon
									icon={item.icon}
									size={14}
									words={item.name}
									badge={badgeOf(item.verdict)}
									class="mr-1 {stylex.attrs(styles.muted).class}"
								/>{/if}{item.name}</span
						>
						<span class="text-right {end} {stylex.attrs(type.shell, styles.muted).class}"
							>{item.lasted}</span
						>
					</svelte:element>
				</li>
			{/each}
			{#if tip.more}
				<li class="px-2 pt-0.5 pb-2 pl-[26px] {END} {stylex.attrs(styles.muted).class}">
					{tip.more} more
				</li>
			{/if}
		</ul>
	{/if}
</div>

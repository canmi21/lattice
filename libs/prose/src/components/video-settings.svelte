<!--
	@component
	The settings in the player's row: the cog, and the menu it opens. The menu names what can be set
	-- quality when there is more than one rung, speed, and how loud the level at its top plays --
	with what each is now, and the choices for one are a page of their own, reached by its row and
	left by the row at the top. A choice closes the menu. So does a press anywhere else, which does
	nothing but close it. See spec/architecture/video/player.md, "The settings menu".
-->
<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import { animateHeight, type AnimationControl } from '@canmi/behavior/collapse';
	import { pressMotion, prefersReducedMotion } from '@canmi/motion';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { animate, cubicBezier } from 'motion';
	import { tick } from 'svelte';
	import type { VideoRung } from '@canmi/artifacts/types';
	import type { LocaleCode } from '@canmi/locales';
	import * as m from '@canmi/messages';
	import { styles } from './video-controls.styles.ts';

	let {
		rungs,
		chosen,
		current,
		suggested,
		rate,
		ceiling,
		menu = $bindable(false),
		locale,
		onquality,
		onrate,
		onceiling,
	}: {
		rungs?: VideoRung[];
		/** The rung the reader picked; undefined while it is left to the chooser, which is "Auto". */
		chosen?: string;
		/** The rung playing now, whoever picked it. */
		current?: VideoRung;
		/** What "Auto" would play for the frame as it is. */
		suggested?: VideoRung;
		rate: number;
		/** What the level slider's top plays at, as a fraction of the clip's full volume. */
		ceiling: number;
		menu?: boolean;
		locale: LocaleCode;
		/** A rung, or undefined to hand the choice back to the chooser. */
		onquality: (src: string | undefined) => void;
		onrate: (rate: number) => void;
		onceiling: (ceiling: number) => void;
	} = $props();

	const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
	/**
	 * How loud the slider's top is. Below 1 the whole slider is finer at the quiet end, for a clip
	 * played under something else; above it is past what the element alone can play, which is the
	 * `GainNode` in `./video-level.ts`.
	 */
	const CEILINGS = [0.05, 0.25, 0.5, 0.75, 1, 1.5, 2];

	/**
	 * How the menu opens and closes: in place, fading and growing from 98% out of the corner by
	 * the cog. The numbers are the site's dropdowns', `menu-content.svelte` in `apps/site`, which
	 * this menu is one of. See spec/styling/player.md, "It opens where it stands".
	 */
	const OPENING = { duration: 150, easing: cubicBezier(0.22, 1, 0.36, 1), scale: 0.98 };

	function appear(_node: Element) {
		if (prefersReducedMotion()) return { duration: 0 };
		const { duration, easing, scale } = OPENING;
		return {
			duration,
			easing,
			css: (t: number) => `opacity: ${t}; transform: scale(${scale + (1 - scale) * t});`,
		};
	}

	type Page = 'root' | 'quality' | 'speed' | 'volume';
	/** Which page the menu shows. Every opening starts at the list of what can be set. */
	let page = $state<Page>('root');
	$effect(() => {
		if (!menu) {
			resizing?.stop();
			resizing = undefined;
		}
	});

	/** Opened at the list of what can be set; the page it closed on is kept while it fades out. */
	function toggle() {
		if (!menu) page = 'root';
		menu = !menu;
	}

	let panel = $state<HTMLElement>();
	let body = $state<HTMLElement>();

	/**
	 * How far a page travels as it comes in: from the side it is in the menu's order, forward
	 * from the end and back from the start, so a page reached is to the right of where it was
	 * reached from.
	 */
	const SHIFT = 12;
	let resizing: AnimationControl | undefined;

	/**
	 * Turn to another page, the way the site moves anything: the panel's height travels to the
	 * new page's with the disclosure's own animation, and the page comes in from its side on the
	 * press timing for that height. With reduced motion it is simply there.
	 */
	async function turn(to: Page) {
		const forward = to !== 'root';
		if (!panel || !body || prefersReducedMotion()) {
			page = to;
			return;
		}
		resizing?.stop();
		const from = panel.getBoundingClientRect().height;
		panel.style.height = `${from}px`;
		page = to;
		await tick();
		if (!panel || !body) return;
		const edge = panel.getBoundingClientRect().height - panel.clientHeight;
		const padding = parseFloat(getComputedStyle(panel).paddingBlockStart) * 2;
		const target = body.getBoundingClientRect().height + padding + edge;
		const settle = (finished?: AnimationControl) => {
			if (finished !== undefined && finished !== resizing) return;
			resizing = undefined;
			if (panel) panel.style.height = '';
		};
		resizing = animateHeight(panel, target, settle);
		const { duration, ease } = pressMotion(target - from || SHIFT);
		animate(
			body,
			{
				opacity: [0, 1],
				transform: [`translateX(${forward ? SHIFT : -SHIFT}px)`, 'translateX(0px)'],
			},
			{ duration, ease },
		);
	}

	/** An event spent: nothing under it hears of it, and it does nothing by default. */
	function spend(event: Event) {
		event.preventDefault();
		event.stopPropagation();
	}

	/** Stop spending clicks once the press that closed the menu is over and its click has come. */
	function release() {
		setTimeout(() => window.removeEventListener('click', spend, true), 0);
	}

	/**
	 * A press outside the menu closes it and is spent doing so: a click on the picture does not
	 * also pause it, and one on a link does not also follow it. The press is taken at the capture
	 * phase, before anything under it hears of it, and so is the click it turns into, which is
	 * only waited for until the press is released. Escape closes it too, and goes no further --
	 * the page mode behind it closes on Escape as well, and one key is one step back.
	 */
	$effect(() => {
		if (!menu) return;
		const press = (event: PointerEvent) => {
			if (panel?.contains(event.target as Node)) return;
			spend(event);
			window.addEventListener('mousedown', spend, { capture: true, once: true });
			window.addEventListener('click', spend, true);
			window.addEventListener('pointerup', release, { capture: true, once: true });
			menu = false;
		};
		const key = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			spend(event);
			menu = false;
		};
		window.addEventListener('pointerdown', press, true);
		window.addEventListener('keydown', key, true);
		return () => {
			window.removeEventListener('pointerdown', press, true);
			window.removeEventListener('keydown', key, true);
		};
	});

	const percent = (value: number) => `${Math.round(value * 100)}%`;
	const auto = $derived(m['video.auto']({}, { locale }));
	/**
	 * What the quality row says it is: the height playing, and "Auto" before it while the choice
	 * is the chooser's -- the reader sees both that it is automatic and what it came to.
	 */
	const quality = $derived.by(() => {
		const height = current ? `${current.height}p` : '';
		if (chosen !== undefined) return height;
		return height ? `${auto} · ${height}` : auto;
	});
	/** Wider when there is a quality row, whose value is the longest thing the menu says. */
	const wide = $derived((rungs?.length ?? 0) > 1);

	const ROW =
		'focus-ring flex w-full cursor-pointer items-center gap-2 px-2 py-0.5 text-start whitespace-nowrap';
</script>

{#snippet entry(to: Page, label: string, value: string)}
	<button
		type="button"
		class="{ROW} {stylex.attrs(styles.menuItem).class}"
		onclick={() => void turn(to)}
	>
		<span class="flex-1">{label}</span>
		<span class={stylex.attrs(styles.menuTitle).class}>{value}</span>
		<CaretRightIcon class="size-2.5" weight="bold" aria-hidden="true" />
	</button>
{/snippet}

{#snippet back(label: string)}
	<button
		type="button"
		class="{ROW} mb-0.5 {stylex.attrs(styles.menuItem, styles.menuItemOn).class}"
		aria-label={m['video.back']({}, { locale })}
		onclick={() => void turn('root')}
	>
		<CaretLeftIcon class="size-2.5" weight="bold" aria-hidden="true" />
		<span class="flex-1">{label}</span>
	</button>
{/snippet}

{#snippet choice(label: string, on: boolean, pick: () => void, hint = '')}
	<button
		type="button"
		class="{ROW} {stylex.attrs(styles.menuItem, on && styles.menuItemOn).class}"
		aria-pressed={on}
		onclick={() => {
			pick();
			menu = false;
		}}
	>
		<CheckIcon class="size-2.5 {on ? '' : 'invisible'}" weight="bold" aria-hidden="true" />
		<span class="flex-1">{label}</span>
		{#if hint}<span class={stylex.attrs(styles.menuTitle).class}>{hint}</span>{/if}
	</button>
{/snippet}

<div class="relative">
	<button
		type="button"
		class="player-button inline-grid size-7.5 cursor-pointer place-items-center {stylex.attrs(
			surfaces.focusRingHost,
			styles.button,
			menu && styles.buttonOn,
		).class}"
		onclick={toggle}
		aria-expanded={menu}
		aria-label={m['video.settings']({}, { locale })}
		title={m['video.settings']({}, { locale })}
	>
		<!--
			The one round glyph in a row of rectangles, brought down to match them by
			growing the canvas under it rather than shrinking the element -- so the focus
			ring, on the 16x16 element, is unchanged. See spec/styling/player.md, "The player's
			glyphs are Phosphor, at two weights, plus three this repository draws", for
			the arithmetic and why the stroke in `.player-glyph-cog` is solved with it.
		-->
		<GearSixIcon
			class="player-glyph player-glyph-cog focus-ring-inner {stylex.attrs(surfaces.focusRingInner)
				.class}"
			weight="bold"
			viewBox="-24.38 -24.38 304.76 304.76"
			aria-hidden="true"
		/>
	</button>
	{#if menu}
		<div
			bind:this={panel}
			transition:appear
			class="absolute end-0 bottom-9 {wide
				? 'w-40'
				: 'w-32'} origin-bottom-right overflow-hidden p-0.5 {stylex.attrs(styles.menu).class}"
		>
			<div bind:this={body}>
				{#if page === 'root'}
					{#if rungs && rungs.length > 1}
						{@render entry('quality', m['video.quality']({}, { locale }), quality)}
					{/if}
					{@render entry('speed', m['video.speed']({}, { locale }), `${rate}×`)}
					{@render entry('volume', m['video.volume']({}, { locale }), percent(ceiling))}
				{:else if page === 'quality'}
					{@render back(m['video.quality']({}, { locale }))}
					{@render choice(
						auto,
						chosen === undefined,
						() => onquality(undefined),
						suggested ? `${suggested.height}p` : '',
					)}
					{#each rungs ?? [] as rung (rung.src)}
						{@render choice(`${rung.height}p`, chosen === rung.src, () => onquality(rung.src))}
					{/each}
				{:else if page === 'speed'}
					{@render back(m['video.speed']({}, { locale }))}
					{#each SPEEDS as speed (speed)}
						{@render choice(`${speed}×`, rate === speed, () => onrate(speed))}
					{/each}
				{:else}
					{@render back(m['video.volume']({}, { locale }))}
					{#each CEILINGS as value (value)}
						{@render choice(percent(value), ceiling === value, () => onceiling(value))}
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.player-button :global(.player-glyph) {
		width: 1rem;
		height: 1rem;
		filter: drop-shadow(var(--player-shadow));
	}

	/* The other half of the cog's optical correction, solved together with the markup's `viewBox`:
	   a filled path has no stroke to thicken, so the weight comes back as an actual stroke of
	   4.571 units. See spec/styling/player.md for the arithmetic. `stroke` inherits, so Phosphor's
	   transparent sizing rect is turned off below rather than left to draw a square around it. */
	.player-button :global(.player-glyph-cog) {
		stroke: currentColor;
		stroke-width: 4.571px;
		stroke-linejoin: round;
	}

	.player-button :global(.player-glyph-cog rect) {
		stroke: none;
	}
</style>

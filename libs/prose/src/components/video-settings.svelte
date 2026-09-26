<!--
	@component
	The settings in the player's row: the cog, and the menu it opens -- quality when there is more
	than one rung, speed, and the ceiling a reader may raise. What each choice does is the player's;
	this only offers them. See `video-controls.svelte`.
-->
<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import { surfaces } from '@canmi/tokens/surfaces';
	import type { VideoRung } from '@canmi/artifacts/types';
	import type { LocaleCode } from '@canmi/locales';
	import * as m from '@canmi/messages';
	import { styles } from './video-controls.styles.ts';

	let {
		rungs,
		chosen,
		rate,
		boost,
		menu = $bindable(false),
		locale,
		onquality,
		onrate,
		onboost,
	}: {
		rungs?: VideoRung[];
		/** The rung playing, when the reader chose one. */
		chosen?: string;
		rate: number;
		boost: boolean;
		menu?: boolean;
		locale: LocaleCode;
		onquality: (src: string) => void;
		onrate: (rate: number) => void;
		onboost: () => void;
	} = $props();
</script>

<div class="relative">
	<button
		type="button"
		class="player-button inline-grid size-7.5 cursor-pointer place-items-center {stylex.attrs(
			surfaces.focusRingHost,
			styles.button,
			menu && styles.buttonOn,
		).class}"
		onclick={() => (menu = !menu)}
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
		<div class="absolute end-0 bottom-9 min-w-28 p-1 text-start {stylex.attrs(styles.menu).class}">
			{#if rungs && rungs.length > 1}
				<p class="m-0 px-2 pt-1 pb-0.5 uppercase {stylex.attrs(styles.menuTitle).class}">
					{m['video.quality']({}, { locale })}
				</p>
				{#each rungs as rung (rung.src)}
					<button
						type="button"
						class="focus-ring block w-full cursor-pointer px-2 py-1 text-start {stylex.attrs(
							styles.menuItem,
							chosen === rung.src && styles.menuItemOn,
						).class}"
						onclick={() => onquality(rung.src)}
					>
						{rung.height}p
					</button>
				{/each}
			{/if}
			<p class="m-0 px-2 pt-1 pb-0.5 uppercase {stylex.attrs(styles.menuTitle).class}">
				{m['video.speed']({}, { locale })}
			</p>
			{#each [0.5, 1, 1.25, 1.5, 2] as speed (speed)}
				<button
					type="button"
					class="focus-ring block w-full cursor-pointer px-2 py-1 text-start {stylex.attrs(
						styles.menuItem,
						rate === speed && styles.menuItemOn,
					).class}"
					onclick={() => onrate(speed)}
				>
					{speed}&times;
				</button>
			{/each}
			<p class="m-0 px-2 pt-1 pb-0.5 uppercase {stylex.attrs(styles.menuTitle).class}">
				{m['video.boost']({}, { locale })}
			</p>
			<button
				type="button"
				class="focus-ring block w-full cursor-pointer px-2 py-1 text-start {stylex.attrs(
					styles.menuItem,
					boost && styles.menuItemOn,
				).class}"
				onclick={onboost}
			>
				200%
			</button>
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

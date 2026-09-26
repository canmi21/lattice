<!--
	@component
	The player's row and the scrubber over it: play, level, the time, captions, settings, and the
	three ways out of the article's column. Shown and hidden by `video-controls.svelte`, which owns
	every state these read and every action they ask for; this draws them. See
	spec/architecture/video/player.md.
-->
<script lang="ts">
	import * as stylex from '@stylexjs/stylex';
	// Phosphor here and Lucide everywhere else -- see `video-controls.svelte` for why.
	import ClosedCaptioningIcon from 'phosphor-svelte/lib/ClosedCaptioningIcon';
	import FrameCornersIcon from 'phosphor-svelte/lib/FrameCornersIcon';
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
	import PictureInPictureIcon from 'phosphor-svelte/lib/PictureInPictureIcon';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import SpeakerHighIcon from 'phosphor-svelte/lib/SpeakerHighIcon';
	import SpeakerSimpleXIcon from 'phosphor-svelte/lib/SpeakerSimpleXIcon';
	import { surfaces } from '@canmi/tokens/surfaces';
	import type { VideoRung } from '@canmi/artifacts/types';
	import type { LocaleCode } from '@canmi/locales';
	import * as m from '@canmi/messages';
	import CornersInWideIcon from './video-glyphs/corners-in-wide.svelte';
	import CornersOutWideIcon from './video-glyphs/corners-out-wide.svelte';
	import FrameCornersInIcon from './video-glyphs/frame-corners-in.svelte';
	import { styles } from './video-controls.styles.ts';
	import VideoSettings from './video-settings.svelte';
	import type { View } from './video-store.ts';

	let {
		view,
		shown,
		volume,
		ceiling,
		chosen,
		current,
		suggested,
		rungs,
		menu = $bindable(false),
		filling,
		locale,
		ontoggle,
		onseek,
		onunmute,
		onvolume,
		oncaptions,
		onquality,
		onrate,
		onceiling,
		onpip,
		pipOffered,
		detached = false,
		onfill,
		onfullscreen,
	}: {
		view: View;
		/** Whether the row is on screen; see `shown` in `video-controls.svelte`. */
		shown: boolean;
		/** The reader's own level, which muted playback never touches. */
		volume: number;
		/** What the level slider's top plays at; see `video-settings.svelte`. */
		ceiling: number;
		chosen?: string;
		current?: VideoRung;
		suggested?: VideoRung;
		rungs?: VideoRung[];
		menu?: boolean;
		filling: boolean;
		locale: LocaleCode;
		ontoggle: () => void;
		onseek: (at: number) => void;
		onunmute: () => void;
		onvolume: (level: number) => void;
		oncaptions: () => void;
		onquality: (src: string | undefined) => void;
		onrate: (rate: number) => void;
		onceiling: (ceiling: number) => void;
		onpip: () => void;
		/** Whether a picture-in-picture window can be had here, the browser's or the page's own. */
		pipOffered: boolean;
		/**
		 * Drawn in the picture-in-picture window rather than on the page: the way back replaces
		 * the way there, and filling the window or the screen means nothing in a window this size.
		 */
		detached?: boolean;
		onfill: () => void;
		onfullscreen: () => void;
	} = $props();

	/**
	 * The single-setting controls a detached row has in place of the cog, and whether any
	 * of them is open -- which holds the row on screen as the cog's menu does.
	 */
	const open = $state({ quality: false, speed: false });
	$effect(() => {
		if (detached) menu = open.quality || open.speed;
	});

	function clock(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
		const whole = Math.floor(seconds);
		const [h, mm, ss] = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60];
		const pad = (value: number) => String(value).padStart(2, '0');
		return h > 0 ? `${h}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
	}

	const played = $derived(view.duration ? (view.currentTime / view.duration) * 100 : 0);
	const loaded = $derived(view.duration ? (view.buffered / view.duration) * 100 : 0);
	const label = $derived(
		view.paused ? m['video.play']({}, { locale }) : m['video.pause']({}, { locale }),
	);
</script>

<div
	class="player-chrome absolute inset-x-0 top-auto bottom-0 px-2.5 pt-8 pb-2 {shown
		? 'pointer-events-auto'
		: 'pointer-events-none'} {stylex.attrs(styles.chrome, shown && styles.chromeShown).class}"
>
	<div class="player-scrub relative mx-1.5 flex h-4 items-center">
		<div
			class="player-track absolute inset-x-0 h-0.75 overflow-hidden {stylex.attrs(styles.track)
				.class}"
		>
			<div
				class="absolute inset-y-0 start-0 {stylex.attrs(styles.bar, styles.loaded).class}"
				style="width:{loaded}%"
			></div>
			<div
				class="absolute inset-y-0 start-0 {stylex.attrs(styles.bar, styles.played).class}"
				style="width:{played}%"
			></div>
		</div>
		<input
			type="range"
			class="player-seek relative m-0 h-4 w-full cursor-pointer appearance-none {stylex.attrs(
				styles.slider,
			).class}"
			min="0"
			max={view.duration || 1}
			step="0.01"
			value={view.currentTime}
			aria-label={m['video.seek']({}, { locale })}
			aria-valuetext="{clock(view.currentTime)} / {clock(view.duration)}"
			oninput={(event) => onseek(Number(event.currentTarget.value))}
		/>
	</div>

	<div class="flex items-center gap-0.5 {stylex.attrs(styles.row).class}">
		<button
			type="button"
			class="player-button inline-grid size-7.5 cursor-pointer place-items-center {stylex.attrs(
				surfaces.focusRingHost,
				styles.button,
			).class}"
			onclick={ontoggle}
			aria-label={label}
			title={label}
		>
			{#if view.paused}<PlayIcon
					class="player-glyph player-glyph-play focus-ring-inner {stylex.attrs(
						surfaces.focusRingInner,
					).class}"
					weight="fill"
					aria-hidden="true"
				/>
			{:else}<PauseIcon
					class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
					weight="fill"
					aria-hidden="true"
				/>{/if}
		</button>

		<div class="player-volume flex items-center">
			<button
				type="button"
				class="player-button inline-grid size-7.5 cursor-pointer place-items-center {stylex.attrs(
					surfaces.focusRingHost,
					styles.button,
				).class}"
				onclick={onunmute}
				aria-label={m['video.mute']({}, { locale })}
				title={m['video.mute']({}, { locale })}
			>
				{#if view.muted || volume === 0}<SpeakerSimpleXIcon
						class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
						weight="fill"
						aria-hidden="true"
					/>
				{:else}<SpeakerHighIcon
						class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
						weight="fill"
						aria-hidden="true"
					/>{/if}
			</button>
			<input
				type="range"
				class="player-level h-4 w-0 cursor-pointer appearance-none {stylex.attrs(
					styles.slider,
					styles.level,
				).class}"
				min="0"
				max="1"
				step="0.01"
				value={view.muted ? 0 : volume}
				aria-label={m['video.volume']({}, { locale })}
				style="--filled:{(view.muted ? 0 : volume) * 100}%"
				oninput={(event) => onvolume(Number(event.currentTarget.value))}
			/>
		</div>

		<span class="ms-1.5 {stylex.attrs(styles.clock).class}"
			>{clock(view.currentTime)} / {clock(view.duration)}</span
		>

		<span class="flex-1"></span>

		{#if view.hasCaptions}
			<button
				type="button"
				class="player-button inline-grid size-7.5 cursor-pointer place-items-center {stylex.attrs(
					surfaces.focusRingHost,
					styles.button,
					view.captions && styles.buttonOn,
				).class}"
				onclick={oncaptions}
				aria-pressed={view.captions}
				aria-label={m['video.captions']({}, { locale })}
				title={m['video.captions']({}, { locale })}
			>
				<ClosedCaptioningIcon
					class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
					weight="bold"
					aria-hidden="true"
				/>
			</button>
		{/if}

		{#if detached}
			{#if rungs && rungs.length > 1}
				<VideoSettings
					{rungs}
					{chosen}
					{current}
					{suggested}
					rate={view.rate}
					{ceiling}
					bind:menu={open.quality}
					only="quality"
					{locale}
					{onquality}
					{onrate}
					{onceiling}
				/>
			{/if}
			<VideoSettings
				{rungs}
				{chosen}
				{current}
				{suggested}
				rate={view.rate}
				{ceiling}
				bind:menu={open.speed}
				only="speed"
				{locale}
				{onquality}
				{onrate}
				{onceiling}
			/>
		{:else}
			<VideoSettings
				{rungs}
				{chosen}
				{current}
				{suggested}
				rate={view.rate}
				{ceiling}
				bind:menu
				{locale}
				{onquality}
				{onrate}
				{onceiling}
			/>
		{/if}

		{#if pipOffered || detached}
			<button
				type="button"
				class="player-button inline-grid size-7.5 cursor-pointer place-items-center {stylex.attrs(
					surfaces.focusRingHost,
					styles.button,
				).class}"
				onclick={onpip}
				aria-label={detached ? m['video.exit-pip']({}, { locale }) : m['video.pip']({}, { locale })}
				title={detached ? m['video.exit-pip']({}, { locale }) : m['video.pip']({}, { locale })}
			>
				<PictureInPictureIcon
					class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
					weight="bold"
					aria-hidden="true"
				/>
			</button>
		{/if}

		{#if !detached}
			<!--
		Web fullscreen is offered only once `.article-column`'s 720px cap has been reached, in
		CSS rather than script so it is right on the first frame. See
		spec/architecture/video/player.md, "Filling the window is a page mode, not a media one".
		The query is spelled out rather than taken from Tailwind's own maximum-width variant,
		which compiles to a strictly-less-than comparison and would leave this control on
		screen at exactly 45rem. Measured against the rule it replaces.
	-->
			<button
				type="button"
				class="player-button inline-grid size-7.5 cursor-pointer place-items-center [@media(max-width:45rem)]:hidden {stylex.attrs(
					surfaces.focusRingHost,
					styles.button,
					filling && styles.buttonOn,
				).class}"
				onclick={onfill}
				aria-pressed={filling}
				aria-label={m['video.fill']({}, { locale })}
				title={m['video.fill']({}, { locale })}
			>
				<!-- A frame, because that is what this fills: the browser's window, with its own chrome
		     still around it. The other button below leaves the browser behind entirely, and the
		     two must not look alike -- they are different destinations, not two sizes of one. -->
				{#if filling}<FrameCornersInIcon
						class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
						aria-hidden="true"
					/>
				{:else}<FrameCornersIcon
						class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
						weight="bold"
						aria-hidden="true"
					/>{/if}
			</button>

			<button
				type="button"
				class="player-button inline-grid size-7.5 cursor-pointer place-items-center {stylex.attrs(
					surfaces.focusRingHost,
					styles.button,
				).class}"
				onclick={onfullscreen}
				aria-label={view.fullscreen
					? m['video.exit-fullscreen']({}, { locale })
					: m['video.fullscreen']({}, { locale })}
				title={view.fullscreen
					? m['video.exit-fullscreen']({}, { locale })
					: m['video.fullscreen']({}, { locale })}
			>
				{#if view.fullscreen}<CornersInWideIcon
						class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
						aria-hidden="true"
					/>
				{:else}<CornersOutWideIcon
						class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
						aria-hidden="true"
					/>{/if}
			</button>
		{/if}
	</div>
</div>

<style>
	/* See `video-controls.svelte` for what is left in a player's scoped block, and why. */

	/* A hidden row is still a tab stop, so it also has to show itself: `:has(:focus-visible)`
   rather than `:focus-within`, which would also pin the row open after a mouse click. Not
   `html[data-focus-source='kbd']` either -- see spec/styling/focus.md, "`:focus-visible` is the
   browser's guess, and the site keeps its own answer". Both declarations stay together because
   the condition is a relation to a descendant, which no class carries -- see
   spec/architecture/css/authoring.md, "An attribute selector is not a condition". */
	.player-chrome:has(:global(:focus-visible)) {
		opacity: 1;
		pointer-events: auto;
	}

	.player-button :global(.player-glyph) {
		width: 1rem;
		height: 1rem;
		filter: drop-shadow(var(--player-shadow));
	}

	/* The same glyph in the row, and the same finding: Phosphor's `Play` is already centred on its
   mass, so the offset that used to be here was a second correction. See the cover's rule. */
	.player-button :global(.player-glyph-play) {
		fill: currentColor;
	}

	/* Both sliders hand their ring to the bar a reader can actually see, the same call
   `focus-ring-inner` makes elsewhere -- but neither utility reaches an `<input>`, whose bar is
   a sibling or a shadow pseudo-element rather than a descendant, so the two placements are
   written out below by hand. The colour they are stated in at rest is in the vocabulary, on
   the three elements a class reaches. See spec/styling/focus.md for the measurement. */
	.player-scrub:has(.player-seek:focus-visible) .player-track {
		outline: 0.125rem solid var(--color-accent);
		outline-offset: 0;
	}

	/* One engine per rule, never a list: a selector list holding a pseudo-element the engine does
   not know invalidates the whole rule, in both engines. */
	.player-level:focus-visible::-webkit-slider-runnable-track {
		outline: 0.125rem solid var(--color-accent);
		outline-offset: 0;
	}

	.player-level:focus-visible::-moz-range-track {
		outline: 0.125rem solid var(--color-accent);
		outline-offset: 0;
	}

	/* The utilities' pointer suppression matches the focused element, and these three rules draw
   on something else, so it cannot reach them. Same shape, written out: a positively known
   pointer takes the outline away, an absent attribute leaves it alone. */
	:global(html[data-focus-source='pointer'])
		.player-scrub:has(.player-seek:focus-visible)
		.player-track {
		outline: none;
	}

	:global(html[data-focus-source='pointer'])
		.player-level:focus-visible::-webkit-slider-runnable-track {
		outline: none;
	}

	:global(html[data-focus-source='pointer']) .player-level:focus-visible::-moz-range-track {
		outline: none;
	}

	/* One engine per rule, never a list: a selector list holding a pseudo-element the engine does
   not know invalidates the whole rule, in both engines. */
	.player-seek::-webkit-slider-runnable-track {
		height: 1rem;
		background: transparent;
	}

	.player-seek::-moz-range-track {
		height: 1rem;
		background: transparent;
	}

	.player-seek::-webkit-slider-thumb {
		appearance: none;
		width: 0.625rem;
		height: 0.625rem;
		margin-top: 0.1875rem;
		border-radius: calc(infinity * 1px);
		background: var(--player-ink);
		box-shadow: var(--player-shadow);
		opacity: 0;
		transition: opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.player-seek::-moz-range-thumb {
		width: 0.625rem;
		height: 0.625rem;
		border: 0;
		border-radius: calc(infinity * 1px);
		background: var(--player-ink);
		box-shadow: var(--player-shadow);
		opacity: 0;
		transition: opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.player-scrub:hover .player-seek::-webkit-slider-thumb,
	.player-seek:focus-visible::-webkit-slider-thumb {
		opacity: 1;
	}

	.player-scrub:hover .player-seek::-moz-range-thumb,
	.player-seek:focus-visible::-moz-range-thumb {
		opacity: 1;
	}

	/* Volume: opens on hover, the way a native player's does. The width it opens to is here and
   the width it rests at is in the markup, because this one is conditioned on the parent. */
	.player-volume:hover .player-level,
	.player-level:focus-visible {
		width: 4rem;
		opacity: 1;
	}

	.player-level::-webkit-slider-runnable-track {
		height: 0.1875rem;
		border-radius: calc(infinity * 1px);
		background: linear-gradient(
			to right,
			var(--player-ink) var(--filled),
			var(--player-ink-faint) var(--filled)
		);
	}

	.player-level::-moz-range-track {
		height: 0.1875rem;
		border-radius: calc(infinity * 1px);
		background: linear-gradient(
			to right,
			var(--player-ink) var(--filled),
			var(--player-ink-faint) var(--filled)
		);
	}

	.player-level::-webkit-slider-thumb {
		appearance: none;
		width: 0.625rem;
		height: 0.625rem;
		margin-top: -0.21875rem;
		border-radius: calc(infinity * 1px);
		background: var(--player-ink);
	}

	.player-level::-moz-range-thumb {
		width: 0.625rem;
		height: 0.625rem;
		border: 0;
		border-radius: calc(infinity * 1px);
		background: var(--player-ink);
	}
</style>

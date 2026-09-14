<script lang="ts">
	/**
	 * The chrome a clip is driven by, bound to Video.js v10's headless core.
	 *
	 * ## What is borrowed and what is ours
	 *
	 * The engine is still the `<video>` element. Between it and this markup sits `@videojs/core`,
	 * a state store plus a set of control cores that ships no CSS at all -- every stylesheet in
	 * that project lives in `@videojs/react` as an opt-in skin. What it gives us is the tedious
	 * half: playback state that follows the element rather than guessing, fullscreen and
	 * picture-in-picture across engines, and text-track modes. Measured at 8.9kB gzipped for the
	 * eleven features named below, against 10.1kB for the fifteen in the preset.
	 *
	 * This binds to `@videojs/core/dom`, the vanilla layer, rather than to the project's custom
	 * elements. That is the whole reason it is usable here: `<media-play-button>` and its siblings
	 * are web components with a shadow root, which none of Tailwind, StyleX or a scoped `<style>`
	 * can reach into. Rendering the markup ourselves keeps all three layers working.
	 *
	 * `attach` is the step, not the constructor. `new HTMLVideoAdapter(video)` compiles, returns
	 * an adapter and attaches nothing: measured, the clip played while `store.currentTime` stayed
	 * at zero and `subscribe` fired not once.
	 *
	 * ## Why the styling is here rather than in StyleX
	 *
	 * Every colour is a `--player-*` token, and those are the one set on this site that does not
	 * follow the theme -- see `libs/tokens/src/player.css` for why. The rest is a scoped `<style>`
	 * because most of it addresses slider pseudo-elements, which no utility and no StyleX object
	 * can name.
	 */
	import {
		bufferFeature,
		controlsFeature,
		errorFeature,
		fullscreenFeature,
		pipFeature,
		playbackFeature,
		playbackRateFeature,
		sourceFeature,
		textTrackFeature,
		timeFeature,
		volumeFeature,
		type PlayerTarget,
	} from '@videojs/core/dom';
	import { HTMLVideoAdapter } from '@videojs/media/dom';
	import { combine, createStore } from '@videojs/store';
	import Captions from '@lucide/svelte/icons/captions';
	import Maximize from '@lucide/svelte/icons/maximize';
	import Minimize from '@lucide/svelte/icons/minimize';
	import Pause from '@lucide/svelte/icons/pause';
	import PictureInPicture from '@lucide/svelte/icons/picture-in-picture-2';
	import Play from '@lucide/svelte/icons/play';
	import Settings from '@lucide/svelte/icons/settings';
	import Volume from '@lucide/svelte/icons/volume-2';
	import VolumeOff from '@lucide/svelte/icons/volume-x';
	import { recall, remember } from '$lib/client/state';
	import type { VideoRung } from '$lib/content/build/assets.ts';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';

	let {
		video,
		frame,
		rungs,
		locale,
	}: {
		video: HTMLVideoElement;
		frame: HTMLElement;
		rungs?: VideoRung[];
		locale: LocaleCode;
	} = $props();

	/**
	 * The features this player uses, named one by one rather than taken from `videoFeatures`.
	 *
	 * The preset is fifteen. Four are for things this site does not have -- `audioTrack` needs a
	 * stream with more than one, `live` and `streamType` need a live stream, `remotePlayback` is
	 * AirPlay and Cast -- one, `orientationLock`, is a phone rotating into fullscreen, and
	 * `quality` is the one whose list stays empty because nothing populates renditions from
	 * separate progressive files. Worth 1.2kB, and worth more as a statement of what is used.
	 */
	const FEATURES = [
		playbackFeature,
		timeFeature,
		bufferFeature,
		volumeFeature,
		playbackRateFeature,
		textTrackFeature,
		fullscreenFeature,
		pipFeature,
		sourceFeature,
		errorFeature,
		controlsFeature,
	] as const;

	/** Where a reader's level lives between visits. Flat and dotted; see `client/state.ts`. */
	const VOLUME_KEY = 'video.volume';
	const BOOST_KEY = 'video.boost';

	/**
	 * Half, and it is a decision rather than a default.
	 *
	 * Every clip is levelled to the same target, so 1.0 is a calibrated level and starting there
	 * is defensible. Starting at half is the other reading: the first clip a reader ever unmutes
	 * should not be the loudest thing on their machine, and the cost of being too quiet is one
	 * drag where the cost of being too loud is a closed tab.
	 */
	const DEFAULT_VOLUME = 0.5;
	const HOVERS = '(hover: hover)';

	let view = $state({
		paused: true,
		currentTime: 0,
		duration: 0,
		buffered: 0,
		muted: true,
		rate: 1,
		fullscreen: false,
		pip: false,
		pipAvailable: false,
		captions: false,
		hasCaptions: false,
		active: true,
	});

	let player = $state<Record<string, unknown> | null>(null);
	/** The reader's own level, which muted playback never touches. See `unmute`. */
	let volume = $state(DEFAULT_VOLUME);
	let boost = $state(false);
	let chosen = $state<string | undefined>(undefined);
	let menu = $state(false);
	/** Web fullscreen: the frame fills the viewport in CSS, without the Fullscreen API. */
	let filling = $state(false);
	/** Whether this page started the clip itself, which is what must not happen twice. */
	let auto = $state(false);
	let gain: GainNode | undefined;

	$effect(() => {
		volume = recall(localStorage, VOLUME_KEY, DEFAULT_VOLUME);
		boost = recall(localStorage, BOOST_KEY, false);
	});

	$effect(() => {
		const store = createStore<PlayerTarget>()(combine(...FEATURES)) as unknown as Record<
			string,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			any
		>;
		const adapter = new HTMLVideoAdapter();
		const released = adapter.attach(video);
		const detach = store.attach({ media: adapter, container: frame });
		player = store;

		const pull = () => {
			// Tuples, not a `TimeRanges`: `MediaBufferState.buffered` is `[start, end][]`, and
			// calling `.end()` on it threw inside this very function, which stopped every field
			// below from being read at all. The last range's end is how much is on hand.
			const ranges = store.buffered as [number, number][] | undefined;
			view = {
				paused: Boolean(store.paused),
				currentTime: Number(store.currentTime ?? 0),
				duration: Number.isFinite(store.duration) ? Number(store.duration) : 0,
				buffered: ranges?.length ? (ranges[ranges.length - 1]?.[1] ?? 0) : 0,
				muted: Boolean(store.muted),
				rate: Number(store.playbackRate ?? 1),
				fullscreen: Boolean(store.fullscreen),
				pip: Boolean(store.pip),
				pipAvailable: store.pipAvailability !== 'unavailable',
				captions: Boolean(store.subtitlesShowing),
				hasCaptions: (store.textTrackList?.length ?? 0) > 0,
				active: Boolean(store.userActive ?? true),
			};
		};
		const stop = store.subscribe(pull);
		pull();

		return () => {
			stop?.();
			detach?.();
			released?.();
			store.destroy?.();
			player = null;
		};
	});

	/**
	 * Muted autoplay, and the rules it follows.
	 *
	 * A clip in prose starts itself once, silently, when the reader shows an interest: a pointer
	 * entering it on a device that has one, or -- on a device that does not -- the first finger
	 * drag of the page while the clip is on screen. A drag rather than a tap, because a tap is a
	 * decision the reader has not made yet and a long press is the platform's own menu.
	 *
	 * After that it plays for as long as it is on screen and pauses when it leaves. Scrolling back
	 * does not restart it: the trigger has to happen again. That is what separates "I glanced at
	 * this" from "this follows me down the page".
	 *
	 * **Muted is a browser rule, not a volume.** No engine will start a clip with sound without a
	 * gesture, so this starts muted -- and `unmute` sets `muted` false and nothing else, because
	 * the reader's level was never changed. Zeroing the stored volume to mute would throw away the
	 * setting they chose the last time they were here.
	 */
	function start() {
		if (auto || !player) return;
		auto = true;
		video.muted = true;
		void (player.play as () => void)?.();
	}

	$effect(() => {
		let visible = false;
		const observer = new IntersectionObserver(
			([entry]) => {
				visible = Boolean(entry?.isIntersecting);
				// Paused rather than stopped: the position is kept, so a reader who comes back and
				// presses play finds the clip where they left it.
				if (!visible && auto && !video.paused) (player?.pause as () => void)?.();
			},
			{ threshold: 0.35 },
		);
		observer.observe(frame);

		const hovers = window.matchMedia(HOVERS).matches;
		const onEnter = () => start();
		const onDrag = () => {
			if (visible) start();
		};
		if (hovers) frame.addEventListener('pointerenter', onEnter);
		else window.addEventListener('touchmove', onDrag, { passive: true });

		return () => {
			observer.disconnect();
			frame.removeEventListener('pointerenter', onEnter);
			window.removeEventListener('touchmove', onDrag);
		};
	});

	/**
	 * The level, and the ceiling a reader may raise.
	 *
	 * `video.volume` is capped at 1, so anything above it needs a `GainNode` -- and therefore
	 * `crossorigin`, which the element already carries. The graph is built once and only when the
	 * louder ceiling is asked for, because `createMediaElementSource` takes the element's audio
	 * over for good and there is no way to hand it back.
	 */
	function applyVolume() {
		const wanted = boost ? volume * 2 : volume;
		if (wanted <= 1) {
			video.volume = wanted;
			if (gain) gain.gain.value = 1;
			return;
		}
		if (!gain) {
			const context = new AudioContext();
			gain = context.createGain();
			context.createMediaElementSource(video).connect(gain).connect(context.destination);
		}
		video.volume = 1;
		gain.gain.value = wanted;
	}

	function setVolume(next: number) {
		volume = next;
		remember(localStorage, VOLUME_KEY, next);
		applyVolume();
		if (next > 0 && video.muted) video.muted = false;
	}

	/** One click, and the level the reader already chose comes back. */
	function unmute() {
		video.muted = !video.muted;
		applyVolume();
	}

	function toggle() {
		if (view.paused) void (player?.play as () => void)?.();
		else (player?.pause as () => void)?.();
	}

	/**
	 * Quality, which the store cannot do for us and says so by leaving its list empty.
	 *
	 * `videoRenditionList` is filled by an engine that knows about renditions -- hls.js from a
	 * master playlist, dash.js from a manifest. Our ladder is separate progressive files, so
	 * nothing fills it: measured, length 0 with four rungs on the page. The class would take them,
	 * since `VideoRendition` carries a `src`, but no adapter puts them there.
	 *
	 * So the swap is ours, and it is all a swap means: remember the position, change the source,
	 * put the position back, resume only if it was playing. The seek lands on the nearest
	 * keyframe, which is why this is the one control that interrupts what it is doing.
	 */
	function quality(src: string) {
		const at = video.currentTime;
		const playing = !video.paused;
		chosen = src;
		video.src = src;
		video.load();
		video.currentTime = at;
		applyVolume();
		if (playing) void video.play();
	}

	function clock(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
		const whole = Math.floor(seconds);
		const [h, mm, ss] = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60];
		const pad = (value: number) => String(value).padStart(2, '0');
		return h > 0 ? `${h}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
	}

	const played = $derived(view.duration ? (view.currentTime / view.duration) * 100 : 0);
	const loaded = $derived(view.duration ? (view.buffered / view.duration) * 100 : 0);
	/** Shown while paused, while a pointer is on it, and whenever the store says the reader is. */
	const shown = $derived(view.paused || view.active || menu);
	const label = $derived(
		view.paused ? m['video.play']({}, { locale }) : m['video.pause']({}, { locale }),
	);
</script>

<!--
	The cover, and the only thing that ever covers the picture. A plate rather than a bare glyph,
	because on a frame this site does not choose a glyph alone has nothing to sit against.
-->
{#if view.paused && !auto}
	<button type="button" onclick={toggle} aria-label={label} class="player-cover">
		<Play class="player-cover-glyph" aria-hidden="true" />
	</button>
{/if}

<div class="player-chrome" class:player-chrome-shown={shown} class:player-filling={filling}>
	<div class="player-scrub">
		<div class="player-track">
			<div class="player-loaded" style="width:{loaded}%"></div>
			<div class="player-played" style="width:{played}%"></div>
		</div>
		<input
			type="range"
			class="player-seek"
			min="0"
			max={view.duration || 1}
			step="0.01"
			value={view.currentTime}
			aria-label={m['video.seek']({}, { locale })}
			aria-valuetext="{clock(view.currentTime)} / {clock(view.duration)}"
			oninput={(event) =>
				(player?.seek as (value: number) => void)?.(Number(event.currentTarget.value))}
		/>
	</div>

	<div class="player-row">
		<button type="button" class="player-button" onclick={toggle} aria-label={label} title={label}>
			{#if view.paused}<Play class="player-glyph player-glyph-play" aria-hidden="true" />
			{:else}<Pause class="player-glyph" aria-hidden="true" />{/if}
		</button>

		<div class="player-volume">
			<button
				type="button"
				class="player-button"
				onclick={unmute}
				aria-label={m['video.mute']({}, { locale })}
				title={m['video.mute']({}, { locale })}
			>
				{#if view.muted || volume === 0}<VolumeOff class="player-glyph" aria-hidden="true" />
				{:else}<Volume class="player-glyph" aria-hidden="true" />{/if}
			</button>
			<input
				type="range"
				class="player-level"
				min="0"
				max="1"
				step="0.01"
				value={view.muted ? 0 : volume}
				aria-label={m['video.volume']({}, { locale })}
				style="--filled:{(view.muted ? 0 : volume) * 100}%"
				oninput={(event) => setVolume(Number(event.currentTarget.value))}
			/>
		</div>

		<span class="player-clock">{clock(view.currentTime)} / {clock(view.duration)}</span>

		<span class="player-gap"></span>

		{#if view.hasCaptions}
			<button
				type="button"
				class="player-button"
				class:player-on={view.captions}
				onclick={() => (player?.toggleSubtitles as () => void)?.()}
				aria-pressed={view.captions}
				aria-label={m['video.captions']({}, { locale })}
				title={m['video.captions']({}, { locale })}
			>
				<Captions class="player-glyph" aria-hidden="true" />
			</button>
		{/if}

		<div class="player-menu-holder">
			<button
				type="button"
				class="player-button"
				class:player-on={menu}
				onclick={() => (menu = !menu)}
				aria-expanded={menu}
				aria-label={m['video.settings']({}, { locale })}
				title={m['video.settings']({}, { locale })}
			>
				<Settings class="player-glyph" aria-hidden="true" />
			</button>
			{#if menu}
				<div class="player-menu">
					{#if rungs && rungs.length > 1}
						<p class="player-menu-title">{m['video.quality']({}, { locale })}</p>
						{#each rungs as rung (rung.src)}
							<button
								type="button"
								class="player-menu-item"
								class:player-on={chosen === rung.src}
								onclick={() => quality(rung.src)}
							>
								{rung.height}p
							</button>
						{/each}
					{/if}
					<p class="player-menu-title">{m['video.speed']({}, { locale })}</p>
					{#each [0.5, 1, 1.25, 1.5, 2] as rate (rate)}
						<button
							type="button"
							class="player-menu-item"
							class:player-on={view.rate === rate}
							onclick={() => (player?.setPlaybackRate as (value: number) => void)?.(rate)}
						>
							{rate}&times;
						</button>
					{/each}
					<p class="player-menu-title">{m['video.boost']({}, { locale })}</p>
					<button
						type="button"
						class="player-menu-item"
						class:player-on={boost}
						onclick={() => {
							boost = !boost;
							remember(localStorage, BOOST_KEY, boost);
							applyVolume();
						}}
					>
						200%
					</button>
				</div>
			{/if}
		</div>

		{#if view.pipAvailable}
			<button
				type="button"
				class="player-button"
				onclick={() => (player?.togglePictureInPicture as () => void)?.()}
				aria-label={m['video.pip']({}, { locale })}
				title={m['video.pip']({}, { locale })}
			>
				<PictureInPicture class="player-glyph" aria-hidden="true" />
			</button>
		{/if}

		<button
			type="button"
			class="player-button"
			class:player-on={filling}
			onclick={() => (filling = !filling)}
			aria-pressed={filling}
			aria-label={m['video.fill']({}, { locale })}
			title={m['video.fill']({}, { locale })}
		>
			<Maximize class="player-glyph" aria-hidden="true" />
		</button>

		<button
			type="button"
			class="player-button"
			onclick={() => (player?.toggleFullscreen as () => void)?.()}
			aria-label={view.fullscreen
				? m['video.exit-fullscreen']({}, { locale })
				: m['video.fullscreen']({}, { locale })}
			title={view.fullscreen
				? m['video.exit-fullscreen']({}, { locale })
				: m['video.fullscreen']({}, { locale })}
		>
			{#if view.fullscreen}<Minimize class="player-glyph" aria-hidden="true" />
			{:else}<Maximize class="player-glyph" aria-hidden="true" />{/if}
		</button>
	</div>
</div>

<style>
	/* The cover: a circle of the same plate the row uses, so the two read as one material. */
	.player-cover {
		position: absolute;
		inset: 0;
		margin: auto;
		display: grid;
		place-items: center;
		width: 4rem;
		height: 4rem;
		border: 0;
		border-radius: calc(infinity * 1px);
		cursor: pointer;
		color: var(--player-ink);
		background: var(--player-plate-strong);
		backdrop-filter: blur(var(--player-blur));
		-webkit-backdrop-filter: blur(var(--player-blur));
		transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.player-cover:hover {
		transform: scale(1.05);
	}

	/* Optical centring, not geometric. A triangle carries its mass behind its point, so the box it
	   is drawn in sits left of where the eye puts the shape. A twentieth of the glyph closes it --
	   the same correction every native play button makes. */
	.player-cover :global(.player-cover-glyph) {
		width: 1.5rem;
		height: 1.5rem;
		translate: 0.075rem 0;
		fill: currentColor;
		filter: drop-shadow(var(--player-shadow));
	}

	/* The chrome: a veil with the controls on it, over the bottom of the frame, taking no height
	   from the picture. */
	.player-chrome {
		position: absolute;
		inset: auto 0 0 0;
		padding: 2rem 0.625rem 0.5rem;
		background: var(--player-veil);
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.player-chrome-shown {
		opacity: 1;
		pointer-events: auto;
	}

	.player-row {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		color: var(--player-ink);
	}

	.player-gap {
		flex: 1;
	}

	.player-button {
		display: inline-grid;
		place-items: center;
		width: 1.875rem;
		height: 1.875rem;
		border: 0;
		border-radius: 0.375rem;
		cursor: pointer;
		color: var(--player-ink-dim);
		background: transparent;
		transition:
			color 200ms cubic-bezier(0.4, 0, 0.2, 1),
			background-color 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.player-button:hover,
	.player-button:focus-visible {
		color: var(--player-ink);
		background: var(--player-wash);
	}

	.player-button.player-on {
		color: var(--player-ink);
	}

	.player-button :global(.player-glyph) {
		width: 1rem;
		height: 1rem;
		filter: drop-shadow(var(--player-shadow));
	}

	.player-button :global(.player-glyph-play) {
		translate: 0.05rem 0;
		fill: currentColor;
	}

	.player-clock {
		margin-inline-start: 0.375rem;
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
		color: var(--player-ink-dim);
		text-shadow: var(--player-shadow);
	}

	/* The scrubber: three stacked bars with a transparent input over them, because an input's own
	   track cannot show a buffered range and an element behind it can. */
	.player-scrub {
		position: relative;
		display: flex;
		align-items: center;
		height: 1rem;
		margin-inline: 0.375rem;
	}

	.player-track {
		position: absolute;
		inset-inline: 0;
		height: 0.1875rem;
		border-radius: calc(infinity * 1px);
		background: var(--player-ink-faint);
		overflow: hidden;
	}

	.player-loaded,
	.player-played {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		border-radius: inherit;
	}

	.player-loaded {
		background: var(--player-ink-dim);
	}

	.player-played {
		background: var(--player-ink);
	}

	.player-seek,
	.player-level {
		appearance: none;
		background: transparent;
		cursor: pointer;
	}

	.player-seek {
		position: relative;
		width: 100%;
		height: 1rem;
		margin: 0;
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

	/* Volume: opens on hover, the way a native player's does. */
	.player-volume {
		display: flex;
		align-items: center;
	}

	.player-level {
		width: 0;
		height: 1rem;
		opacity: 0;
		transition:
			width 200ms cubic-bezier(0.4, 0, 0.2, 1),
			opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

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

	/* The menu stands away from the frame, so it carries the plate rather than the veil. */
	.player-menu-holder {
		position: relative;
	}

	.player-menu {
		position: absolute;
		inset-block-end: 2.25rem;
		inset-inline-end: 0;
		min-width: 7rem;
		padding: 0.25rem;
		border-radius: 0.625rem;
		background: var(--player-plate-strong);
		backdrop-filter: blur(var(--player-blur));
		-webkit-backdrop-filter: blur(var(--player-blur));
		text-align: start;
	}

	.player-menu-title {
		margin: 0;
		padding: 0.25rem 0.5rem 0.125rem;
		font-size: 0.625rem;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--player-ink-faint);
	}

	.player-menu-item {
		display: block;
		width: 100%;
		padding: 0.25rem 0.5rem;
		border: 0;
		border-radius: 0.375rem;
		cursor: pointer;
		text-align: start;
		font-size: 0.75rem;
		color: var(--player-ink-dim);
		background: transparent;
	}

	.player-menu-item:hover,
	.player-menu-item:focus-visible {
		color: var(--player-ink);
		background: var(--player-wash);
	}

	.player-menu-item.player-on {
		color: var(--player-ink);
	}

	@media (prefers-reduced-motion: reduce) {
		.player-cover,
		.player-chrome,
		.player-button,
		.player-level {
			transition: none;
		}
	}
</style>

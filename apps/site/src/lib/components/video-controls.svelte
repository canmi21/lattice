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
	// Phosphor here and Lucide everywhere else, which is a deliberate split rather than drift.
	// The rest of this site's icons sit in prose at text size and next to words; a player's sit
	// on a picture at 16px with no label, and Phosphor's heavier, rounder strokes hold up there
	// where Lucide's thin geometry starts to disappear. The two never meet: no component outside
	// this one imports from `phosphor-svelte`.
	//
	// The `*Icon` names, not the bare ones -- `CornersOut` and its siblings are deprecated
	// aliases and say so in their own types.
	import ClosedCaptioningIcon from 'phosphor-svelte/lib/ClosedCaptioningIcon';
	import CornersInIcon from 'phosphor-svelte/lib/CornersInIcon';
	import CornersOutIcon from 'phosphor-svelte/lib/CornersOutIcon';
	import FrameCornersIcon from 'phosphor-svelte/lib/FrameCornersIcon';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
	import PictureInPictureIcon from 'phosphor-svelte/lib/PictureInPictureIcon';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import SpeakerHighIcon from 'phosphor-svelte/lib/SpeakerHighIcon';
	import SpeakerSimpleXIcon from 'phosphor-svelte/lib/SpeakerSimpleXIcon';
	import { recall, remember } from '$lib/client/state';
	import type { VideoRung } from '$lib/content/build/assets.ts';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';

	let {
		video,
		frame,
		rungs,
		gain: levelling = 1,
		filling = $bindable(false),
		locale,
	}: {
		video: HTMLVideoElement;
		frame: HTMLElement;
		rungs?: VideoRung[];
		/**
		 * The clip's own levelling, so this one plays at the same loudness as every other.
		 *
		 * Measured at import and computed in the build; see `assets.ts`. It multiplies the
		 * reader's level rather than replacing it -- the slider still says what fraction of full
		 * they asked for, and this is what full means for this clip.
		 */
		gain?: number;
		/**
		 * Web fullscreen: the frame fills the viewport in CSS, without asking the Fullscreen API.
		 *
		 * Owned by `video.svelte` and bound here, rather than held in this component and written
		 * onto the frame from script. The frame is the thing that changes shape, so the state
		 * belongs to the file that draws it -- and a mode set from a child by `setAttribute` is a
		 * selector Svelte prunes as unused, because nothing in that file's markup ever says it.
		 *
		 * It is the mode a reader wants when they want the clip large without leaving the page:
		 * the browser's own chrome stays, which is the whole difference from the button beside it.
		 * No player library offers it, because it is a page mode rather than a media one.
		 */
		filling?: boolean;
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
	/**
	 * What web fullscreen does to the page behind it.
	 *
	 * **The scroll is swallowed, not redirected.** There is nothing to scroll while the mode is on
	 * and no gesture leaves it: a wheel or a drag simply does nothing, which is what a mode that
	 * has taken over the window should do. Leaving is Escape or the button, both of which are
	 * deliberate. An earlier version took a scroll as "out", and that is wrong for the same reason
	 * it is wrong in a native player -- a reader nudging the wheel while watching did not ask to
	 * be put back in the article.
	 *
	 * Three things hold it. `overflow: hidden` on the document stops the page; the scrollbar that
	 * removes is paid back as padding so the layout underneath does not jump sideways; and
	 * `touchmove` is cancelled so a phone does not rubber-band the page behind the black. The
	 * chrome is exempt, because dragging the scrubber or the volume is a touchmove too and
	 * cancelling it would make both unusable with a finger.
	 *
	 * The article comes back where it was. `overflow: hidden` keeps the offset in the engines
	 * measured here, but it is not promised anywhere, and a reader returned to the top of a long
	 * article has lost their place for a reason they cannot see -- so it is recorded on the way in
	 * and put back on the way out.
	 */
	$effect(() => {
		if (!filling) return;
		const { body, documentElement: root } = document;
		const gutter = window.innerWidth - root.clientWidth;
		const overflow = body.style.overflow;
		const padding = body.style.paddingInlineEnd;
		body.style.overflow = 'hidden';
		if (gutter > 0) body.style.paddingInlineEnd = `${gutter}px`;

		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') filling = false;
		};
		const swallow = (event: TouchEvent) => {
			if ((event.target as Element | null)?.closest('.player-chrome')) return;
			event.preventDefault();
		};
		window.addEventListener('keydown', onKey);
		document.addEventListener('touchmove', swallow, { passive: false });

		return () => {
			body.style.overflow = overflow;
			body.style.paddingInlineEnd = padding;
			window.removeEventListener('keydown', onKey);
			document.removeEventListener('touchmove', swallow);
			window.scrollTo({ top: restore, behavior: 'instant' });
		};
	});

	/**
	 * Where the article was before the frame left the flow.
	 *
	 * Recorded by whoever turns the mode on, not by the effect that follows. By the time an effect
	 * runs the frame is already `fixed`, the document is that much shorter, and the browser has
	 * clamped the scroll to the new height -- measured, 11883 became 11581 before a line of this
	 * ran, and restoring to it put the reader three hundred pixels from where they were.
	 */
	let restore = 0;

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
	 * What a clip is at any moment, and it is three things rather than two.
	 *
	 * ```
	 *  sleeping  -- looks exactly like a picture. No chrome, nothing moving. A touch device also
	 *               draws a play button here, because it has no way to discover the clip by
	 *               pointing at it; a pointer device draws nothing, because it does.
	 *       |
	 *       |  a pointer arrives, or a finger presses and wanders
	 *       v
	 * previewing -- playing, silent, still no chrome. The picture moves and that is the whole
	 *               invitation: a reader who wanted a picture has lost nothing, and a reader who
	 *               wanted a clip now knows there is one.
	 *       |
	 *       |  a click, which is the first gesture an engine will accept sound on
	 *       v
	 *    awake   -- sound on at the reader's own level, chrome available, and playback carries on
	 *               through the transition. The click woke the sound; it did not ask for a pause.
	 * ```
	 *
	 * The order matters and is the reason for three states rather than two. Chrome appearing on
	 * hover would answer a question the reader has not asked yet, and a clip that started with
	 * sound would answer it far too loudly. Each step is the smallest thing that can follow from
	 * what the reader just did.
	 *
	 * **There is no way back to `sleeping`.** Once a reader has told this clip they want it, the
	 * page does not take that back on them -- leaving with the pointer keeps it playing, and
	 * scrolling it off screen pauses without forgetting.
	 */
	type Stage = 'sleeping' | 'previewing' | 'awake';
	let stage = $state<Stage>('sleeping');

	/**
	 * Whether this device has a pointer that can rest on something without pressing it.
	 *
	 * The whole split below hangs on this one query and not on a screen width: a touch laptop and
	 * a phone want the same answer, and a narrow window on a desktop wants the other one.
	 */
	const HOVERS = '(hover: hover)';
	let hovers = $state(true);
	$effect(() => {
		const query = window.matchMedia(HOVERS);
		hovers = query.matches;
		const sync = () => (hovers = query.matches);
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});

	/** Silent play, which is the only kind an engine allows before a gesture. */
	function preview() {
		if (stage !== 'sleeping' || !player) return;
		stage = 'previewing';
		video.muted = true;
		void (player.play as () => void)?.();
	}

	/**
	 * The gesture that buys sound, and it buys nothing else.
	 *
	 * Playback is not touched here. A reader who clicks a clip that is already running silently
	 * asked for the sound, not for a pause -- pausing would answer a question nobody asked and
	 * cost them the second they clicked on. The level comes back from where it was left; muting
	 * never wrote to it, so there is nothing to recover.
	 */
	function wake() {
		stage = 'awake';
		video.muted = false;
		applyVolume();
		if (video.paused) void (player?.play as () => void)?.();
	}

	/**
	 * Waking a clip on a touch device, and keeping it on screen.
	 *
	 * Two things start a preview. A pointer arriving is one. The other is a finger pressing the
	 * clip and wandering -- far enough that the platform drops its long-press menu, not far enough
	 * to be a tap, and never lifting into one. That state is reachable and it is the closest thing
	 * a touch device has to hovering.
	 *
	 * Once previewing, it runs until it leaves the screen. Coming back does not restart it: the
	 * pause is a pause and the reader decides what happens next.
	 */
	$effect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) return;
				// Paused rather than stopped, so a reader who returns finds it where they left it.
				if (stage !== 'sleeping' && !video.paused) (player?.pause as () => void)?.();
			},
			{ threshold: 0.35 },
		);
		observer.observe(frame);

		const onEnter = () => {
			over = true;
			preview();
		};
		const onLeave = () => {
			over = false;
		};
		let down: { x: number; y: number } | null = null;
		const onStart = (event: TouchEvent) => {
			const touch = event.touches[0];
			down = touch ? { x: touch.clientX, y: touch.clientY } : null;
		};
		const onMove = (event: TouchEvent) => {
			const touch = event.touches[0];
			if (!down || !touch) return;
			// Four pixels: past what a still finger drifts, short of what the platform reads as a
			// drag. Enough to say the finger is on the clip and moving rather than tapping it.
			const moved = Math.hypot(touch.clientX - down.x, touch.clientY - down.y) > 4;
			if (moved) preview();
		};
		const onEnd = () => {
			down = null;
		};

		if (hovers) {
			frame.addEventListener('pointerenter', onEnter);
			frame.addEventListener('pointerleave', onLeave);
		} else {
			frame.addEventListener('touchstart', onStart, { passive: true });
			frame.addEventListener('touchmove', onMove, { passive: true });
			frame.addEventListener('touchend', onEnd, { passive: true });
		}

		return () => {
			observer.disconnect();
			frame.removeEventListener('pointerenter', onEnter);
			frame.removeEventListener('pointerleave', onLeave);
			frame.removeEventListener('touchstart', onStart);
			frame.removeEventListener('touchmove', onMove);
			frame.removeEventListener('touchend', onEnd);
		};
	});

	/**
	 * What the picture does when it is pressed, which is not the same question on the two devices.
	 *
	 * **With a pointer** there is one gesture and it means whatever the stage has left for it: the
	 * first click wakes the sound, and every click after that is play and pause. Chrome follows
	 * the pointer, so it needs no gesture of its own.
	 *
	 * **Without one** there are two, because the chrome cannot follow anything. A single tap shows
	 * the chrome and the next one hides it again; a double tap plays and pauses. That costs the
	 * single tap a wait -- it cannot act until it knows a second one is not coming -- which is why
	 * it is given to the cheap, reversible action and the double tap keeps the expensive one.
	 */
	let showChrome = $state(false);
	let pending: ReturnType<typeof setTimeout> | undefined;
	/** Whether a pointer is on the frame, which is what "hover shows the chrome" actually means. */
	let over = $state(false);

	export function press() {
		if (stage !== 'awake') {
			wake();
			showChrome = true;
			return;
		}
		if (hovers) {
			if (video.paused) void (player?.play as () => void)?.();
			else (player?.pause as () => void)?.();
			return;
		}
		if (pending) {
			clearTimeout(pending);
			pending = undefined;
			if (video.paused) void (player?.play as () => void)?.();
			else (player?.pause as () => void)?.();
			return;
		}
		// 280ms is the window every platform uses for a double tap, give or take.
		pending = setTimeout(() => {
			pending = undefined;
			showChrome = !showChrome;
		}, 280);
	}

	/**
	 * The level, and the ceiling a reader may raise.
	 *
	 * `video.volume` is capped at 1, so anything above it needs a `GainNode` -- and therefore
	 * `crossorigin`, which the element already carries. The graph is built once and only when it
	 * is needed, because `createMediaElementSource` takes the element's audio over for good and
	 * there is no way to hand it back.
	 *
	 * Two things can push past the cap. The reader's own ceiling, which is the flag below, and a
	 * clip quiet enough that its levelling is above one -- measured, one of the three here is,
	 * and at half volume it still lands under the cap, so the graph is built for the reader who
	 * turns that clip up rather than for everyone.
	 */
	function applyVolume() {
		const wanted = (boost ? volume * 2 : volume) * levelling;
		if (wanted <= 1) {
			video.volume = wanted;
			if (gain) gain.gain.value = 1;
			return;
		}
		if (!gain) {
			// **Only ever from a click.** Every caller of this is one -- the volume slider, the
			// mute button, a quality change -- and that matters more than it looks: a context
			// created without a gesture starts suspended, and once `createMediaElementSource` has
			// taken the element's audio a suspended context is not quiet, it is silent. `resume`
			// is the belt to that brace.
			//
			// A browser with no `AudioContext` keeps the cap instead of losing its sound.
			try {
				const context = new AudioContext();
				gain = context.createGain();
				context.createMediaElementSource(video).connect(gain).connect(context.destination);
				void context.resume();
			} catch {
				video.volume = 1;
				return;
			}
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
	/**
	 * Whether the chrome is on screen, which is a different question on the two devices.
	 *
	 * `sleeping` and `previewing` never show it: a clip that looks like a picture has no controls,
	 * and one running silently is an invitation rather than a player. Only `awake` has chrome at
	 * all, and only because the reader asked for it.
	 *
	 * Once awake, a pointer device follows the pointer: the chrome is there while the pointer is
	 * on the frame and gone when it leaves, which is what "hover shows it" means and is a fact
	 * about where the pointer is rather than about how recently it moved. `userActive` refines
	 * that -- a pointer resting still over a playing clip lets the chrome fade, the way a native
	 * player does -- and a paused clip keeps its controls, because a reader who stopped it is
	 * looking at them.
	 *
	 * A touch device has no pointer to follow, so it follows the taps counted in `press`.
	 */
	const shown = $derived(
		stage === 'awake' &&
			(hovers ? (over && (view.active || view.paused)) || menu : showChrome || menu),
	);
	const label = $derived(
		view.paused ? m['video.play']({}, { locale }) : m['video.pause']({}, { locale }),
	);
</script>

<!--
	The cover, and the only thing that ever covers the picture. A plate rather than a bare glyph,
	because on a frame this site does not choose a glyph alone has nothing to sit against.
-->
<!--
	The cover, and the only thing that ever covers the picture.

	Drawn on a touch device and not on a pointer one, which is the asymmetry the whole interaction
	rests on. A pointer discovers the clip by arriving at it -- the picture starts moving and that
	is the invitation. A finger cannot arrive anywhere, so a clip with nothing on it is a picture
	as far as anyone can tell, and the button is the only thing that says otherwise.

	It goes as soon as it has been used, because from then on the clip has said what it is.
-->
{#if !hovers && stage === 'sleeping'}
	<button
		type="button"
		onclick={press}
		aria-label={m['video.play']({}, { locale })}
		class="player-cover"
	>
		<PlayIcon class="player-cover-glyph" weight="fill" aria-hidden="true" />
	</button>
{/if}

<div class="player-chrome" class:player-chrome-shown={shown}>
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
			{#if view.paused}<PlayIcon class="player-glyph player-glyph-play" weight="fill" aria-hidden="true" />
			{:else}<PauseIcon class="player-glyph" weight="fill" aria-hidden="true" />{/if}
		</button>

		<div class="player-volume">
			<button
				type="button"
				class="player-button"
				onclick={unmute}
				aria-label={m['video.mute']({}, { locale })}
				title={m['video.mute']({}, { locale })}
			>
				{#if view.muted || volume === 0}<SpeakerSimpleXIcon class="player-glyph" weight="fill" aria-hidden="true" />
				{:else}<SpeakerHighIcon class="player-glyph" weight="fill" aria-hidden="true" />{/if}
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
				<ClosedCaptioningIcon class="player-glyph" weight="fill" aria-hidden="true" />
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
				<GearSixIcon class="player-glyph" weight="fill" aria-hidden="true" />
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
				<PictureInPictureIcon class="player-glyph" weight="fill" aria-hidden="true" />
			</button>
		{/if}

		<button
			type="button"
			class="player-button player-fill"
			class:player-on={filling}
			onclick={() => {
				if (!filling) restore = window.scrollY;
				filling = !filling;
			}}
			aria-pressed={filling}
			aria-label={m['video.fill']({}, { locale })}
			title={m['video.fill']({}, { locale })}
		>
			<!-- A frame, because that is what this fills: the browser's window, with its own chrome
			     still around it. The other button below leaves the browser behind entirely, and the
			     two must not look alike -- they are different destinations, not two sizes of one. -->
			<FrameCornersIcon class="player-glyph" weight="fill" aria-hidden="true" />
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
			{#if view.fullscreen}<CornersInIcon class="player-glyph" weight="fill" aria-hidden="true" />
			{:else}<CornersOutIcon class="player-glyph" weight="fill" aria-hidden="true" />{/if}
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

	/**
	 * Web fullscreen is offered only once the article column has stopped growing.
	 *
	 * `.article-column` caps at 720px, so at any width below that the column is already as wide as
	 * the window and filling it gains a reader nothing -- the clip is the same size either way,
	 * and a control that does nothing visible is worse than one that is not there. Withheld in CSS
	 * rather than in script so it is right on the first frame and follows a window being dragged.
	 *
	 * The screen-fullscreen button beside it is not withheld: leaving the browser behind is worth
	 * something at every width, and on a phone it is the only one of the two that is.
	 */
	@media (max-width: 45rem) {
		.player-fill {
			display: none;
		}
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

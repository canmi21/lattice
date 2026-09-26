<script module lang="ts">
	/**
	 * Whether a reader has given this page permission to make noise, for every clip at once.
	 *
	 * Module scope rather than per-clip state, and never reset -- there is no gesture that means
	 * "withdraw consent to hear things". See spec/architecture/video/player.md, "A clip is a picture,
	 * then a silent picture, then a player", for why sound is the page's to grant and why
	 * granting it does not also grant chrome.
	 */
	let unlocked = $state(false);
</script>

<script lang="ts">
	/**
	 * The chrome a clip is driven by, bound to Video.js v10's headless core rather than its skin.
	 *
	 * See spec/architecture/video/player.md, "The chrome is built on `@videojs/core`'s headless
	 * store, not its skin", for why `@videojs/core/dom` and not the preset or custom elements, and
	 * for the `attach` trap. Every colour is a `--player-*` token, the one that does not follow the
	 * theme -- see `libs/tokens/src/player.css` for why. What is left in the scoped blocks -- at the
	 * foot of this file, of `video-chrome.svelte` and of `video-settings.svelte` -- is a selector no
	 * class can reach. The row is drawn by those two; the stages, the gestures and the store are here.
	 */
	import { combine, createStore } from '@videojs/store';
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
	// Phosphor here and Lucide everywhere else -- see spec/styling/player.md, "The player's glyphs
	// are Phosphor, at two weights, plus three this repository draws", for the fill-vs-bold rule and
	// the reasoning behind the split. `*Icon` names, not the bare ones: `CornersOut` and its
	// siblings are deprecated aliases and say so in their own types. The three shapes Phosphor
	// does not draw -- the landscape corner pair and the frame's exit state -- live in
	// `./video-glyphs`, in the same hand, at Phosphor's props minus `weight`.
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
	import PictureInPictureIcon from 'phosphor-svelte/lib/PictureInPictureIcon';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import { reader } from '@canmi/behavior/state';
	import type { VideoRung } from '@canmi/artifacts/types';
	import type { LocaleCode } from '@canmi/locales';
	import * as m from '@canmi/messages';
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { placeCaptions } from './video-captions.ts';
	import VideoChrome, { type View } from './video-chrome.svelte';
	import { styles } from './video-controls.styles.ts';
	import { Level } from './video-level.ts';
	import { holdPage } from './video-page.ts';
	import { Place } from './video-place.svelte.ts';
	import { Quality } from './video-quality.svelte.ts';
	import { claimOnPlay } from './video-session.ts';
	import { moveToWindow, ownable } from './video-pip.ts';
	import VideoPip from './video-pip.svelte';
	import VideoAway from './video-away.svelte';
	import { mount, unmount } from 'svelte';

	let {
		video,
		frame,
		clip,
		rungs,
		gain: levelling = 1,
		filling = $bindable(false),
		locale,
	}: {
		/**
		 * The clip and the box around it, once there are any -- undefined on the server and for
		 * the first client render. Used to be withheld until both were bound, so the cover
		 * appeared only at hydration, at full opacity: measured, nothing until 400ms then a disc
		 * against a first paint at 88ms. Rendering from the start lets the server write the same
		 * disc the client keeps, guarded at each use rather than by a gate in the parent.
		 */
		video?: HTMLVideoElement;
		frame?: HTMLElement;
		/**
		 * What the article calls this clip, which is what its position is filed under.
		 *
		 * The reference and not a rung's URL: the chooser picks a different rung on a different
		 * screen and the settings menu swaps rungs mid-play, so a URL would lose the position
		 * exactly where it matters most. It is `{cid}.mp4` today and the map does not care which
		 * spelling it is, only that it is the same one every time. See `client/progress.ts`.
		 */
		clip: string;
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
		 * Owned by `video.svelte` and bound here rather than held locally -- see
		 * spec/architecture/video/player.md, "Filling the window is a page mode, not a media one", for
		 * why the state belongs to the file that draws the frame and how this mode differs from
		 * the button beside it.
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
	/**
	 * What the level slider's top plays at, as a fraction of the clip's full volume. It replaced a
	 * yes-or-no doubling, kept under `video.boost`, which is read once as 2 and then forgotten.
	 */
	const CEILING_KEY = 'video.ceiling';
	const BOOST_KEY = 'video.boost';

	/**
	 * Whether this reader wants captions, everywhere, until they say otherwise.
	 *
	 * One answer for the whole site rather than one per clip. A reader who turns captions on has
	 * told you something about themselves -- they are in a quiet carriage, or the accent is hard,
	 * or they simply read faster than they listen -- and none of that is a fact about the clip
	 * they happened to be watching when they said it. In the `reader` record for the same reason:
	 * it belongs to the person, not to the sitting.
	 */
	const CAPTIONS_KEY = 'video.captions';
	let wantsCaptions = $state(false);

	/**
	 * Half, and it is a decision rather than a default.
	 *
	 * Every clip is levelled to the same target, so 1.0 is a calibrated level and starting there
	 * is defensible. Starting at half is the other reading: the first clip a reader ever unmutes
	 * should not be the loudest thing on their machine, and the cost of being too quiet is one
	 * drag where the cost of being too loud is a closed tab.
	 */
	const DEFAULT_VOLUME = 0.5;

	let view = $state<View>({
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
	});

	let player = $state<Record<string, unknown> | null>(null);
	/** The reader's own level, which muted playback never touches. See `unmute`. */
	let volume = $state(DEFAULT_VOLUME);
	let ceiling = $state(1);
	let menu = $state(false);
	/**
	 * What web fullscreen does to the page behind it: scroll swallowed, not redirected -- see
	 * spec/architecture/video/player.md, "Filling the window is a page mode, not a media one". Three
	 * things hold it: `overflow: hidden`, the scrollbar gutter paid back as padding, and
	 * `touchmove` cancelled except over the chrome, which needs it to drag the scrubber and volume.
	 */
	$effect(() => {
		if (!filling) return;
		return holdPage(
			() => (filling = false),
			() => restore,
		);
	});

	/**
	 * Where the article was before the frame left the flow, recorded by whoever turns the mode
	 * on -- see spec/architecture/video/player.md, "Filling the window is a page mode, not a media
	 * one", for why not the effect that follows. Measured: 11883 became 11581 before a line ran.
	 */
	let restore = 0;

	/** The clip's level past what the element alone can play. See `./video-level.ts`. */
	const level = new Level();

	/** Which rung plays, the reader's or the chooser's. See `./video-quality.svelte.ts`. */
	const ladder = new Quality(
		() => video,
		() => rungs,
		() => `${view.fullscreen}|${filling}`,
		() => applyVolume(),
	);

	$effect(() => {
		volume = reader.recall(localStorage, VOLUME_KEY, DEFAULT_VOLUME);
		ceiling = reader.recall(
			localStorage,
			CEILING_KEY,
			reader.recall(localStorage, BOOST_KEY, false) ? 2 : 1,
		);
		wantsCaptions = reader.recall(localStorage, CAPTIONS_KEY, false);
	});

	/**
	 * Put the reader's answer to this clip, once this clip is in a position to be asked -- a clip
	 * with no tracks does not use the value at all. See spec/architecture/video/captions.md,
	 * "Captions are a fact about the reader, not about the clip". `toggleSubtitles` rather than a
	 * setter is what the store offers; the guard above makes calling it idempotent.
	 */
	$effect(() => {
		if (!view.hasCaptions || !player) return;
		if (view.captions === wantsCaptions) return;
		(player.toggleSubtitles as () => void)?.();
	});

	$effect(() => {
		const store = createStore<PlayerTarget>()(combine(...FEATURES)) as unknown as Record<
			string,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			any
		>;
		if (!video || !frame) return;
		const adapter = new HTMLVideoAdapter();
		// `attach` returns nothing -- read in @videojs/media 10.0.0-rc.2, every path falls off the
		// end -- so there is no release function to hold and the teardown below has none to call.
		adapter.attach(video);
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
			};
		};
		const stop = store.subscribe(pull);
		pull();

		return () => {
			stop?.();
			detach?.();
			store.destroy?.();
			player = null;
		};
	});

	/**
	 * What a clip is at any moment: `sleeping`, `previewing`, `awake` -- see
	 * spec/architecture/video/player.md, "A clip is a picture, then a silent picture, then a player",
	 * for what each stage means and why there is no way back to `sleeping` once a reader has
	 * told a clip they want it.
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

	/** Where this clip is, kept for the tab. See `./video-place.svelte.ts`. */
	const place = new Place(
		() => video,
		() => clip,
	);

	/**
	 * The frame the clip was on when it left for the picture-in-picture window, captured into a
	 * canvas because the browser's own placeholder paints nothing (and painted the poster before
	 * that was dropped). See spec/architecture/video/player.md, "A clip playing elsewhere leaves the
	 * frame it left on", for why grey and dimmed, and why the canvas is always in the DOM rather
	 * than conditional on state.
	 */
	let still = $state<HTMLCanvasElement>();

	/** Copy the frame the clip is on into the still. */
	function capture(): void {
		const element = video;
		const canvas = still;
		if (!element || !canvas) return;
		// Tainting is not a concern: the canvas is displayed, never read back, and drawing
		// from a cross-origin element only blocks `getImageData` and `toDataURL`.
		canvas.width = element.videoWidth || 16;
		canvas.height = element.videoHeight || 9;
		canvas.getContext('2d')?.drawImage(element, 0, 0, canvas.width, canvas.height);
	}

	$effect(() => {
		const element = video;
		if (!element) return;
		element.addEventListener('enterpictureinpicture', capture);
		return () => element.removeEventListener('enterpictureinpicture', capture);
	});

	/**
	 * The page's own picture-in-picture window, while the clip is in it. See `./video-pip.ts`, and
	 * spec/architecture/video/player.md, "Picture in picture is ours where the browser allows it".
	 */
	let own = $state<{ release: () => void }>();

	/** Whether the clip is playing somewhere other than here, in either kind of window. */
	const away = $derived(view.pip || own !== undefined);

	/** Move the clip into a window the page draws; the browser's own if that is refused. */
	async function goOwn(): Promise<void> {
		const element = video;
		if (!element || own || !frame) return;
		capture();
		const opened = await moveToWindow(element, frame, (target, onClose) => {
			const shown = mount(VideoPip, {
				target,
				props: {
					video: element,
					get chrome() {
						return pipChrome;
					},
				},
			});
			onClose(() => void unmount(shown));
		});
		if (!opened) return void (player?.togglePictureInPicture as () => void)?.();
		opened.closed.then(() => (own = undefined));
		own = opened;
	}

	/**
	 * The system's media controls drive the clip last played: claimed at `play`, let go when the
	 * clip is gone. See `./video-session.ts`.
	 */
	$effect(() => {
		const element = video;
		if (!element) return;
		return claimOnPlay(
			element,
			{ play: start, pause: () => (player?.pause as () => void)?.() },
			// The page's title, or its heading where the page names none -- the editor's preview.
			() => document.title || document.querySelector('h1')?.textContent?.trim() || '',
		);
	});

	/** Open a picture-in-picture window: the page's own where it can be, the browser's where not. */
	function togglePip(): void {
		if (away) return returnHere();
		if (ownable()) return void goOwn();
		(player?.togglePictureInPicture as () => void)?.();
	}

	/** Bring the clip back from the other window, which is the one thing the still is good for. */
	function returnHere(): void {
		if (own) return own.release();
		void document.exitPictureInPicture?.().catch(() => {
			// The window was closed from its own control between the press and this call. The
			// state will catch up on `leavepictureinpicture` either way.
		});
	}

	/** Where captions sit: see `./video-captions.ts`. */
	$effect(() => {
		const element = video;
		if (!element) return;
		// The shape, and only the shape. `filling` and `view.fullscreen` are read so this reruns
		// when either changes; the resize listener covers the window itself.
		void filling;
		void view.fullscreen;
		void view.hasCaptions;
		placeCaptions(element);
		const again = () => placeCaptions(element);
		window.addEventListener('resize', again);
		// Cues do not exist until the track has loaded, and a track loads once.
		for (const node of element.querySelectorAll('track')) node.addEventListener('load', again);
		document.addEventListener('fullscreenchange', again);
		return () => {
			window.removeEventListener('resize', again);
			for (const node of element.querySelectorAll('track')) node.removeEventListener('load', again);
			document.removeEventListener('fullscreenchange', again);
		};
	});

	/** Play, by way of `Place`, which puts the clip back where the tab left it first. */
	function start(): void {
		place.start(() => void (player?.play as () => void)?.());
	}

	/**
	 * Start a preview, silent or not depending on what the reader has already allowed.
	 *
	 * Silent is the only kind an engine permits before a gesture, and silent is also the only
	 * polite kind: a page that starts talking at somebody who has not asked is the behaviour every
	 * reader has learned to dread. Once they have asked once -- by unmuting any clip here -- the
	 * next one they point at comes with sound, because making them ask again for something they
	 * have already said is the other half of the same rudeness.
	 */
	function preview() {
		if (stage !== 'sleeping' || !player || !video) return;
		stage = 'previewing';
		video.muted = !unlocked;
		if (unlocked) applyVolume();
		start();
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
		if (!video) return;
		stage = 'awake';
		unlocked = true;
		video.muted = false;
		applyVolume();
		if (video.paused) start();
	}

	/**
	 * Waking a clip on a touch device, and keeping it on screen: a finger pressing and wandering
	 * -- far enough to drop the platform's long-press menu, never lifting into a tap -- is this
	 * device's closest thing to hovering. See spec/architecture/video/player.md, "On a touch device",
	 * for why lifting does not pause, unlike a pointer leaving.
	 */
	$effect(() => {
		if (!video || !frame) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) return void place.prime();
				// Playing in another window, the clip is not on this page to scroll past.
				if (away) return;
				// Paused rather than stopped, so a reader who returns finds it where they left it.
				if (stage !== 'sleeping' && !video.paused) (player?.pause as () => void)?.();
			},
			{ threshold: 0.35 },
		);
		observer.observe(frame);

		const onEnter = () => {
			over = true;
			// Arriving is not a reason to take the disc away that instant. The row comes up on the
			// same movement, and two things changing in opposite directions in one frame reads as
			// a flinch; the countdown lets the one that is leaving leave on its own.
			hold();
			if (stage === 'sleeping') preview();
			// Back on the clip it left: pick up from where the pointer left off rather than from
			// the beginning. The position was kept precisely so this would be a resumption.
			else if (stage === 'previewing' && video.paused) start();
		};
		const onLeave = () => {
			over = false;
			// A preview lasts as long as the pointer does -- it was never asked for, so it has no
			// business continuing once the pointer leaves. Only a preview: an `awake` clip was
			// asked for and keeps playing wherever the pointer goes.
			if (stage === 'previewing' && !video.paused) (player?.pause as () => void)?.();
			// The row goes at once and the disc does not, because from here the disc is the only
			// control there is. How long it stays is `covered`'s question, not this one's: a
			// clip still running takes the countdown, a paused one is kept.
			hold();
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
	 * What the picture does when pressed, which is not the same question on the two devices. A
	 * pointer has one gesture, meaning whatever the stage has left for it; a touch device has two,
	 * since the chrome cannot follow a finger -- single tap shows it, double tap plays and pauses.
	 * The single tap pays a wait for that split, so it gets the cheap, reversible action.
	 */
	let showChrome = $state(false);
	let pending: ReturnType<typeof setTimeout> | undefined;
	/** Whether a pointer is on the frame, which is what "hover shows the chrome" actually means. */
	let over = $state(false);

	export function press() {
		if (!video) return;
		// While it is playing somewhere else, pressing the picture can only mean one thing.
		if (away) return void returnHere();
		if (stage !== 'awake') {
			wake();
			showChrome = true;
			// The click that buys sound is the one moment the whole interface should answer: row
			// and disc together. Said explicitly because the usual trigger does not fire here --
			// a pointer arriving already started the silent preview, so `paused` never changes.
			hold();
			return;
		}
		if (hovers) {
			if (video.paused) start();
			else (player?.pause as () => void)?.();
			return;
		}
		if (pending) {
			clearTimeout(pending);
			pending = undefined;
			if (video.paused) start();
			else (player?.pause as () => void)?.();
			return;
		}
		// 280ms is the window every platform uses for a double tap, give or take.
		pending = setTimeout(() => {
			pending = undefined;
			showChrome = !showChrome;
		}, 280);
	}

	/** The reader's level, times this clip's levelling, onto the element. See `./video-level.ts`. */
	function applyVolume() {
		if (!video) return;
		level.apply(video, volume * ceiling * levelling);
	}

	function setVolume(next: number) {
		volume = next;
		reader.remember(localStorage, VOLUME_KEY, next);
		applyVolume();
		if (next > 0 && video?.muted) video.muted = false;
	}

	/** One click, and the level the reader already chose comes back. */
	function unmute() {
		if (!video) return;
		video.muted = !video.muted;
		applyVolume();
	}

	function toggle() {
		if (view.paused) start();
		else (player?.pause as () => void)?.();
	}

	/** What "Auto" would play, asked again whenever the menu opens or the frame changes size. */
	const suggested = $derived.by(() => {
		void view.fullscreen;
		void filling;
		void menu;
		return ladder.suggest();
	});

	/** The row in the page's own picture-in-picture window, with the same state and actions. */
	const pipChrome = $derived({
		view,
		volume,
		ceiling,
		chosen: ladder.chosen,
		current: ladder.current,
		suggested,
		rungs,
		filling: false,
		locale,
		pipOffered: true,
		ontoggle: toggle,
		onseek: (at: number) => (player?.seek as (value: number) => void)?.(at),
		onunmute: unmute,
		onvolume: setVolume,
		oncaptions: toggleCaptions,
		onquality: (src: string | undefined) => ladder.pick(src),
		onrate: (rate: number) => (player?.setPlaybackRate as (value: number) => void)?.(rate),
		onceiling: setCeiling,
		onpip: returnHere,
		onfill: () => {},
		onfullscreen: () => {},
	});

	/**
	 * The reader's answer, and the only thing that writes it. The store is told by the effect above
	 * rather than from here, so there is one path onto the clip whether the answer arrives by a
	 * press now or out of the record at load.
	 */
	function toggleCaptions() {
		wantsCaptions = !wantsCaptions;
		reader.remember(localStorage, CAPTIONS_KEY, wantsCaptions);
	}

	function setCeiling(next: number) {
		ceiling = next;
		reader.remember(localStorage, CEILING_KEY, next);
		reader.forget(localStorage, BOOST_KEY);
		applyVolume();
	}

	function toggleFill() {
		if (!filling) restore = window.scrollY;
		filling = !filling;
	}

	/**
	 * Whether the chrome is on screen: never in `sleeping` or `previewing`, and only `awake` shows
	 * it since only a click asked for it. A pointer device follows the pointer and nothing else; a
	 * touch device follows the taps counted in `press`. See spec/architecture/video/player.md, "On a
	 * pointer device", for why it does not also fade on an idle timer the way a native player's
	 * does.
	 */
	const shown = $derived(
		!away && stage === 'awake' && (hovers ? over || menu : showChrome || menu),
	);
	/** Whether the pointer is on the cover itself, which is not the same as being on the frame. */
	let onCover = $state(false);
	/** Whether the countdown started by the last state change is still running. */
	let lingering = $state(false);
	let linger: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Whether the cover is asking to be seen -- three answers, because it answers three different
	 * questions: the invitation before a click, a guest over the row once awake, and the only
	 * control when the pointer is off the frame. See spec/architecture/video/player.md, "On a pointer
	 * device", for each one and for why both edges are countdowns rather than switches.
	 */
	const covered = $derived(
		// Never while the clip is elsewhere, whatever stage it left in. The still has its own
		// control and two discs on one picture is one more than there is anything to press.
		!away &&
			(hovers
				? stage === 'awake'
					? onCover || lingering || (!over && view.paused)
					: !over
				: stage === 'sleeping'),
	);

	/**
	 * What the cover is drawn as, which is not the same as whether the clip is running. Before the
	 * first click it always shows the invitation -- reading `paused` directly flashed a pause
	 * button on a clip nobody had started, since the state is not the cover's to report yet. See
	 * spec/architecture/video/player.md.
	 */
	const coverRunning = $derived(stage === 'awake' && !view.paused);

	/**
	 * How long the cover stays up after the clip starts running, when nothing is pointing at it.
	 *
	 * It is showing a Pause button over the middle of the picture, which is worth a moment and not
	 * worth a minute: long enough to read the state that just changed, short enough that a clip
	 * playing to a still pointer is unobstructed.
	 */
	const COVER_LINGER = 2000;

	/**
	 * Restart the countdown. Not the store's own `userActive`: that resets on any movement inside
	 * the container, so a pointer merely wandering across the picture kept bringing the Pause
	 * button back. This cover's only concern is movement on the 64px disc itself.
	 */
	function hold() {
		lingering = true;
		clearTimeout(linger);
		linger = setTimeout(() => {
			lingering = false;
		}, COVER_LINGER);
	}

	/**
	 * A state change is the one thing worth putting the cover back up for, and the countdown
	 * decides how long for. Paused keeps it up outright, so this matters on the way to running.
	 *
	 * The comparison is the whole rule. `pull` replaces `view` wholesale on every notification the
	 * store sends, and a playing clip sends them several times a second, so an effect that merely
	 * reads `view.paused` runs on all of them -- which restarted the countdown continuously and
	 * left the cover up forever. What is wanted is the transition, not the value.
	 */
	let wasPaused = true;
	$effect(() => {
		const paused = view.paused;
		if (paused === wasPaused) return;
		wasPaused = paused;
		if (stage !== 'awake') return;
		hold();
	});

	$effect(() => () => clearTimeout(linger));
	const coverLabel = $derived(
		coverRunning ? m['video.pause']({}, { locale }) : m['video.play']({}, { locale }),
	);
</script>

<!--
	The cover, the only thing that ever covers the picture -- a plate rather than a bare glyph,
	because a frame this site does not choose gives a glyph nothing to sit against. What `covered`
	means differs by device and by stage; see spec/architecture/video/player.md, and `covered`'s
	own doc above for the derivation.
-->
<!--
	What stands where the clip stands while the clip is somewhere else.

	Always in the DOM, because the frame has to be copied at `enterpictureinpicture` and a canvas
	conditional on the state would not exist until after it. Shown only while the state says so.
-->
<canvas
	bind:this={still}
	class="pointer-events-none absolute inset-0 h-full w-full object-cover {stylex.attrs(
		styles.still,
		away && styles.stillShown,
	).class}"
	aria-hidden="true"
></canvas>

{#if away}
	<VideoAway {locale} onreturn={returnHere} />
{/if}

{#if hovers || stage === 'sleeping'}
	<button
		type="button"
		onclick={(event) => {
			// The frame carries the same `press` for a click anywhere on the picture, so without
			// this the cover's own click runs it twice and the two cancel out: play, then pause.
			event.stopPropagation();
			press();
		}}
		aria-label={coverLabel}
		title={coverLabel}
		onpointerenter={() => (onCover = true)}
		onpointerleave={() => {
			onCover = false;
			// Leaving is where the countdown starts, so the disc outlives the pointer by the same
			// moment it would have had if the pointer had never arrived.
			hold();
		}}
		class="player-cover absolute inset-0 m-auto grid size-16 cursor-pointer place-items-center focus-visible:pointer-events-auto {covered
			? 'pointer-events-auto'
			: 'pointer-events-none'} {stylex.attrs(styles.cover, covered && styles.coverShown).class}"
	>
		{#if coverRunning}<PauseIcon class="player-cover-pause" weight="fill" aria-hidden="true" />
		{:else}<PlayIcon class="player-cover-glyph" weight="fill" aria-hidden="true" />{/if}
	</button>
{/if}

<VideoChrome
	{view}
	{shown}
	{volume}
	{ceiling}
	chosen={ladder.chosen}
	current={ladder.current}
	{suggested}
	{rungs}
	bind:menu
	{filling}
	{locale}
	ontoggle={toggle}
	onseek={(at) => (player?.seek as (value: number) => void)?.(at)}
	onunmute={unmute}
	onvolume={setVolume}
	oncaptions={toggleCaptions}
	onquality={(src) => ladder.pick(src)}
	onrate={(rate) => (player?.setPlaybackRate as (value: number) => void)?.(rate)}
	onceiling={setCeiling}
	onpip={togglePip}
	pipOffered={view.pipAvailable || ownable()}
	onfill={toggleFill}
	onfullscreen={() => (player?.toggleFullscreen as () => void)?.()}
/>

<style>
	/* What is left here is what no class can reach, which is the whole of the escape hatch's job:
	   spec/architecture/css/layers.md, "What each layer owns, by name". Three kinds of thing --
	   the slider pseudo-elements the two range inputs are actually drawn from, the glyphs inside
	   the icon components, and the rules whose condition is a relation rather than a state of the
	   element itself. Everything else the block used to hold is in the vocabulary at the head of
	   this file or in the markup's own classes. */

	/* Every control here opts into the site's keyboard indicator by name -- the accent outline,
	   flush, suppressed on a pointer. Which utility depends on the control's visible edge: a
	   circle or a row's own width takes `focus-ring`; a 30px button around a 16px glyph hands the
	   outline to the glyph with `focus-ring-inner`, since the 7px around it is hit target rather
	   than control. See spec/styling/focus.md and libs/tokens/src/interaction.css for the measurement. */

	/* The cover's ring is drawn on the glyph and follows its actual shape, not a box around it --
	   neither the 64px disc nor a box around the 30px glyph is the thing being pointed at. `w` is
	   the site's 0.125rem stroke width, at this glyph's scale 42.67 user units. See
	   spec/styling/focus.md for why the ring is an exception here and how `paint-order` makes a
	   stroke read as one. The disc's own `outline: none` is in the vocabulary, on the element a
	   class does reach. */
	.player-cover:focus-visible :global(svg) {
		stroke: var(--color-accent);
		stroke-width: 42.67px;
		stroke-linejoin: round;
		paint-order: stroke fill;
	}

	.player-cover :global(svg rect) {
		stroke: none;
	}

	/* The site's rule, restated because it is drawn on the glyph rather than on the focused
	   element and the utilities' suppression matches the focused element. */
	:global(html[data-focus-source='pointer']) .player-cover:focus-visible :global(svg) {
		stroke: none;
	}

	/* No offset: Phosphor already centres `Play` on its mass (centroid 127.65 against a viewBox
	   centre of 128) and `Pause` needs none either, so the `translate` that used to be here was a
	   correction on top of a correction. See spec/styling/player.md -- this is a result, not an
	   omission. */
	.player-cover :global(.player-cover-glyph),
	.player-cover :global(.player-cover-pause) {
		/* Against the 4rem disc this is a triangle 38% of the diameter tall, which is where a
		   native play button sits. At 1.5rem it was 30% and the disc read as the bigger object. */
		width: 1.875rem;
		height: 1.875rem;
		fill: currentColor;
		filter: drop-shadow(var(--player-shadow));
	}
</style>

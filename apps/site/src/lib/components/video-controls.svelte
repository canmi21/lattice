<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { duration, easing, figures, radius, text, tracking } from '$lib/vocabulary.stylex.ts';

	/**
	 * The player's own vocabulary, and a member of no named surface in `surfaces.ts`: those are
	 * read against the page and these against a video frame. See spec/styling/player.md, "The
	 * player brings its own colours, because it cannot know what is behind them", and
	 * spec/architecture/css/authoring.md, "Colour is never retyped".
	 *
	 * A transition naming two properties writes its lists doubled and as literals, the way
	 * `surfaces.quietControl` does: spec/todo/todo.md, "A `transition` shorthand sets five lists".
	 */
	const styles = stylex.create({
		/**
		 * The disc over the middle of the picture. `transform` is here rather than in the markup
		 * because the frame cannot spell it: Tailwind 4 enlarges with the `scale` property, which
		 * is a different declaration and a different computed value from this one. The three
		 * `outline` longhands are `outline: none` written out, because an omitted longhand is not
		 * its initial value -- measured, the shorthand leaves `currentColor` and `medium` behind
		 * it. See spec/architecture/css/migration.md.
		 */
		cover: {
			borderWidth: 0,
			borderStyle: 'none',
			borderRadius: radius.full,
			color: 'var(--player-ink)',
			backgroundColor: 'var(--player-glass)',
			backdropFilter: 'blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate))',
			WebkitBackdropFilter: 'blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate))',
			// Hidden by default and faded in, on the chrome's curve and duration, because after the
			// first click the two leave together: a clip playing to nobody drops its whole
			// interface at once rather than in two steps. The `:focus-visible` branch is the
			// invisible tab stop -- a ring drawn on a control nobody can see is worse than none.
			opacity: { default: 0, ':focus-visible': 1 },
			transform: { default: null, ':hover': 'scale(1.05)' },
			outlineStyle: { default: null, ':focus-visible': 'none' },
			outlineWidth: { default: null, ':focus-visible': 'medium' },
			outlineColor: { default: null, ':focus-visible': 'currentColor' },
			transitionProperty: {
				default: 'opacity, transform',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '200ms, 200ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: 'cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1)',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
			transitionDelay: { default: '0s, 0s', '@media (prefers-reduced-motion: reduce)': '0s' },
			// The fifth list the shorthand set. Two entries, because a `transition` naming two
			// properties computes to two -- measured, `normal, normal` before and `normal` after
			// when it was left off, which renders the same and is still a value that changed.
			transitionBehavior: {
				default: 'normal, normal',
				'@media (prefers-reduced-motion: reduce)': 'normal',
			},
		},
		/** The cover on screen, which the disc and the picture-in-picture return share. */
		coverShown: { opacity: 1 },

		/**
		 * The still: grey and slightly dimmed, which is the whole message -- this is a picture of
		 * the clip and not the clip. Its fade is not in the reduced-motion branch below and was
		 * not before, so it is carried across as it stands.
		 */
		still: {
			filter: 'grayscale(1) brightness(0.55)',
			opacity: 0,
			transitionProperty: 'opacity',
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
			transitionDelay: '0s',
		},
		stillShown: { opacity: 1 },

		/**
		 * The veil under the control row, which is a gradient and therefore a background image
		 * rather than a background colour. The row's other half of this pair -- the answer to a
		 * focus inside it -- stays in the scoped block, where a relational selector can reach it.
		 */
		chrome: {
			backgroundImage: 'var(--player-veil)',
			opacity: 0,
			transitionProperty: {
				default: 'opacity',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: easing.inOut,
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
			transitionDelay: { default: '0s', '@media (prefers-reduced-motion: reduce)': '0s' },
		},
		chromeShown: { opacity: 1 },

		/** The ink the row hands down to everything in it. */
		row: { color: 'var(--player-ink)' },

		/**
		 * A control in the row. Hover lights the glyph and draws nothing behind it -- a plate here
		 * would be a plate on the row's own veil, and a bigger visual event than the state it
		 * reports. The wash stays for the menu below, where a highlighted row is the surface
		 * rather than an ornament.
		 */
		button: {
			borderWidth: 0,
			borderStyle: 'none',
			borderRadius: radius.md,
			color: {
				default: 'var(--player-ink-dim)',
				':hover': 'var(--player-ink)',
				':focus-visible': 'var(--player-ink)',
			},
			backgroundColor: 'transparent',
			transitionProperty: { default: 'color', '@media (prefers-reduced-motion: reduce)': 'none' },
			transitionDuration: {
				default: duration.base,
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: easing.inOut,
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
			transitionDelay: { default: '0s', '@media (prefers-reduced-motion: reduce)': '0s' },
		},
		/** A toggle reporting that it is on, which is full ink and nothing else. */
		buttonOn: { color: 'var(--player-ink)' },

		/** The elapsed and total time, in figures that do not shift width as they count. */
		clock: {
			fontSize: text.px11,
			fontVariantNumeric: figures.tabular,
			color: 'var(--player-ink-dim)',
			textShadow: 'var(--player-shadow)',
		},

		/**
		 * The scrubber's unfilled bar. Its `outlineColor` is stated at rest for the reason
		 * spec/styling/focus.md gives: an outline's colour is `currentColor` until named, and the
		 * ring this bar is handed would otherwise start from the row's ink.
		 */
		track: {
			borderRadius: radius.full,
			backgroundColor: 'var(--player-ink-faint)',
			outlineColor: 'var(--color-accent)',
		},
		/** Both bars take the track's corner rather than restating it. */
		bar: { borderRadius: 'inherit' },
		loaded: { backgroundColor: 'var(--player-ink-dim)' },
		played: { backgroundColor: 'var(--player-ink)' },

		/**
		 * What the two range inputs share: no ground of their own, and a ring they hand to the bar
		 * a reader can actually see. The three `outline` longhands are `outline: none` written
		 * out, the same as the cover's.
		 */
		slider: {
			backgroundColor: 'transparent',
			outlineStyle: { default: null, ':focus-visible': 'none' },
			outlineWidth: { default: null, ':focus-visible': 'medium' },
			outlineColor: { default: 'var(--color-accent)', ':focus-visible': 'currentColor' },
		},
		/**
		 * The volume slider, closed. The width it opens to lives in the scoped block with the
		 * parent's hover, which no class can express.
		 */
		level: {
			opacity: 0,
			transitionProperty: {
				default: 'width, opacity',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
			transitionDuration: {
				default: '200ms, 200ms',
				'@media (prefers-reduced-motion: reduce)': '0s',
			},
			transitionTimingFunction: {
				default: 'cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1)',
				'@media (prefers-reduced-motion: reduce)': 'ease',
			},
			transitionDelay: { default: '0s, 0s', '@media (prefers-reduced-motion: reduce)': '0s' },
			transitionBehavior: {
				default: 'normal, normal',
				'@media (prefers-reduced-motion: reduce)': 'normal',
			},
		},

		/**
		 * The settings menu stands away from the frame, so it carries the plate rather than the
		 * veil. Its corner is a literal: 0.625rem is on no scale this repository names.
		 */
		menu: {
			borderRadius: '0.625rem',
			backgroundColor: 'var(--player-glass)',
			backdropFilter: 'blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate))',
			WebkitBackdropFilter: 'blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate))',
		},
		menuTitle: {
			fontSize: text.px10,
			letterSpacing: tracking.caps,
			color: 'var(--player-ink-faint)',
		},
		/** A row in the menu, where the highlight is the surface rather than an ornament on it. */
		menuItem: {
			borderWidth: 0,
			borderStyle: 'none',
			borderRadius: radius.md,
			fontSize: text.px12,
			color: {
				default: 'var(--player-ink-dim)',
				':hover': 'var(--player-ink)',
				':focus-visible': 'var(--player-ink)',
			},
			backgroundColor: {
				default: 'transparent',
				':hover': 'var(--player-wash)',
				':focus-visible': 'var(--player-wash)',
			},
		},
		menuItemOn: { color: 'var(--player-ink)' },
	});

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
	 * theme -- see `libs/tokens/src/player.css` for why. The scoped block at the foot keeps 71 of
	 * its 195 declarations, and every one of them is a selector no class can reach.
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
	// Phosphor here and Lucide everywhere else -- see spec/styling/player.md, "The player's glyphs
	// are Phosphor, at two weights, plus three this repository draws", for the fill-vs-bold rule and
	// the reasoning behind the split. `*Icon` names, not the bare ones: `CornersOut` and its
	// siblings are deprecated aliases and say so in their own types. The three shapes Phosphor
	// does not draw -- the landscape corner pair and the frame's exit state -- live in
	// `./video-glyphs`, in the same hand, at Phosphor's props minus `weight`.
	import ClosedCaptioningIcon from 'phosphor-svelte/lib/ClosedCaptioningIcon';
	import FrameCornersIcon from 'phosphor-svelte/lib/FrameCornersIcon';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
	import PictureInPictureIcon from 'phosphor-svelte/lib/PictureInPictureIcon';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import SpeakerHighIcon from 'phosphor-svelte/lib/SpeakerHighIcon';
	import SpeakerSimpleXIcon from 'phosphor-svelte/lib/SpeakerSimpleXIcon';
	import CornersInWideIcon from './video-glyphs/corners-in-wide.svelte';
	import CornersOutWideIcon from './video-glyphs/corners-out-wide.svelte';
	import FrameCornersInIcon from './video-glyphs/frame-corners-in.svelte';
	import { keepPosition, positionOf, stillOf } from '$lib/client/progress';
	import { reader } from '$lib/client/state';
	import type { VideoRung } from '@canmi/artifacts/types';
	import type { LocaleCode } from '$lib/locale';
	import * as m from '$lib/paraglide/messages';

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
	});

	let player = $state<Record<string, unknown> | null>(null);
	/** The reader's own level, which muted playback never touches. See `unmute`. */
	let volume = $state(DEFAULT_VOLUME);
	let boost = $state(false);
	let chosen = $state<string | undefined>(undefined);
	let menu = $state(false);
	/**
	 * What web fullscreen does to the page behind it: scroll swallowed, not redirected -- see
	 * spec/architecture/video/player.md, "Filling the window is a page mode, not a media one". Three
	 * things hold it: `overflow: hidden`, the scrollbar gutter paid back as padding, and
	 * `touchmove` cancelled except over the chrome, which needs it to drag the scrubber and volume.
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
	 * Where the article was before the frame left the flow, recorded by whoever turns the mode
	 * on -- see spec/architecture/video/player.md, "Filling the window is a page mode, not a media
	 * one", for why not the effect that follows. Measured: 11883 became 11581 before a line ran.
	 */
	let restore = 0;

	let gain: GainNode | undefined;

	$effect(() => {
		volume = reader.recall(localStorage, VOLUME_KEY, DEFAULT_VOLUME);
		boost = reader.recall(localStorage, BOOST_KEY, false);
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

	/**
	 * Where this clip was when the tab last saw it, applied at the last possible moment -- read
	 * once and spent once. See spec/architecture/video/player.md, "A reload finds a clip where the
	 * tab left it", for why it waits for the viewport rather than load or the first `play`.
	 */
	let restored: number | undefined;
	$effect(() => {
		restored = positionOf(sessionStorage, clip)?.at;
		const element = video;
		if (restored === undefined || !element) return;
		/**
		 * A clip this tab has already watched seeks at `loadedmetadata`, before the element
		 * decodes its own frame -- narrowing the frame-zero flash, not closing it: a cached clip
		 * can decode frame zero before hydration runs, a race script cannot win. What actually
		 * hides it is the transparency hold; see spec/architecture/video/player.md, "A clip the tab
		 * remembers does not show itself until the frame is the right one" for the measured
		 * 100ms/80ms/315ms. Clips with no remembered position still wait, per `prime` below.
		 */
		const early = () => prime();
		if (element.readyState >= HTMLMediaElement.HAVE_METADATA) early();
		else element.addEventListener('loadedmetadata', early, { once: true });
		return () => element.removeEventListener('loadedmetadata', early);
	});

	/**
	 * The frame the clip was on when it left for the picture-in-picture window, captured into a
	 * canvas because the browser's own placeholder paints nothing (and painted the poster before
	 * that was dropped). See spec/architecture/video/player.md, "A clip playing elsewhere leaves the
	 * frame it left on", for why grey and dimmed, and why the canvas is always in the DOM rather
	 * than conditional on state.
	 */
	let still = $state<HTMLCanvasElement>();

	/**
	 * Whether this source has already been asked for a frame.
	 *
	 * Reset when the element takes a new one -- a rung swap calls `load()`, which throws away
	 * whatever was decoded -- so the replacement is asked for a frame of its own.
	 */
	let primed = false;
	$effect(() => {
		const element = video;
		if (!element) return;
		const again = () => {
			primed = false;
		};
		element.addEventListener('emptied', again);
		element.addEventListener('loadstart', again);
		return () => {
			element.removeEventListener('emptied', again);
			element.removeEventListener('loadstart', again);
		};
	});

	$effect(() => {
		const element = video;
		const canvas = still;
		if (!element || !canvas) return;
		const capture = () => {
			// Tainting is not a concern: the canvas is displayed, never read back, and drawing
			// from a cross-origin element only blocks `getImageData` and `toDataURL`.
			canvas.width = element.videoWidth || 16;
			canvas.height = element.videoHeight || 9;
			canvas.getContext('2d')?.drawImage(element, 0, 0, canvas.width, canvas.height);
		};
		element.addEventListener('enterpictureinpicture', capture);
		return () => element.removeEventListener('enterpictureinpicture', capture);
	});

	/** Bring the clip back from the other window, which is the one thing the still is good for. */
	function returnHere(): void {
		void document.exitPictureInPicture?.().catch(() => {
			// The window was closed from its own control between the press and this call. The
			// state will catch up on `leavepictureinpicture` either way.
		});
	}

	/**
	 * Where captions sit, decided when the shape changes and at no other time.
	 *
	 * See spec/architecture/video/captions.md, "A caption is set in the page's voice and placed in
	 * the black", for the whole account: why a bar only gets the caption once it is comfortably
	 * taller than one (`CUE_ROOM`), why cues are positioned against the element box rather than the
	 * picture, and why the answer is recomputed on shape rather than on cues.
	 */
	const CUE_LINES = 2;
	/**
	 * The caption's own height, in multiples of its size: 1.35 is `::cue`'s line-height in
	 * `video.svelte`, and the plate is painted to exactly that box, nothing added around it. See
	 * spec/architecture/video/captions.md, "A caption is set in the page's voice and placed in the
	 * black", for the measurement against a real caption.
	 */
	const CUE_BLOCK = 1.35 * CUE_LINES;
	/**
	 * How much taller than the caption a bar has to be before the caption is put in it.
	 *
	 * A bar that merely fits the caption is not a place to put one. At 1.5 the leftover is half a
	 * caption, a quarter of one above and a quarter below, which is the least that reads as a
	 * caption sitting in a bar rather than filling it. Measured on a 1000x730 window before this
	 * existed: a bar of 83.8 took a caption block of 73.2 and left 5.3px of black under the
	 * descenders, which is the failure this number is against.
	 */
	const CUE_ROOM = 1.5;
	/**
	 * How far above the picture's bottom edge a caption sits, in multiples of the caption's own
	 * size -- the same gap looks half as big under a caption twice the size. At 0.8 the article
	 * keeps its old 13.2px gap, 12.8px. See spec/architecture/video/captions.md, "A caption is set in
	 * the page's voice and placed in the black", for what this replaced.
	 */
	const CUE_CLEAR = 0.8;
	/**
	 * What stands in for the plate's horizontal padding: `::cue` cannot be padded, so a
	 * non-collapsing space sits on each side of every line instead. Thin space gives 4px a side,
	 * the finest available short of a class of its own scaled by `font-size` -- see
	 * spec/architecture/video/captions.md, "A caption is set in the page's voice and placed in the
	 * black", for the measurement and the alternatives it beat.
	 */
	const CUE_PAD = '\u2009';
	/** A caption reads at a size taken from the picture, between these two. */
	const CUE_MIN = 14;
	const CUE_MAX = 30;
	const CUE_SCALE = 0.042;

	/**
	 * How much of the picture a caption may fill before it is worth breaking (`KEEP`), and how
	 * full the first line aims to be when it does break (`FILL`, short of `KEEP` on purpose). The
	 * file's own break point is a suggestion about where, not about whether -- see
	 * spec/architecture/video/captions.md, "A caption is set in the page's voice and placed in the
	 * black", for why and for the measurement.
	 */
	const CUE_KEEP = 0.9;
	const CUE_FILL = 0.8;
	/** What stopping at a clause is worth, against how unequal it leaves the two lines. */
	const CUE_NUDGE = 0.08;

	/**
	 * What the files say, kept so that re-measuring is idempotent.
	 *
	 * Every recompute rewrites `text`, so without the original the second pass would be measuring
	 * the first pass's answer and the caption would drift a word at a time.
	 */
	const written = new WeakMap<TextTrackCue, string>();

	/** One canvas for every measurement this component ever makes. */
	let ruler: CanvasRenderingContext2D | null | undefined;

	/**
	 * Where to break a caption that has to break, which is a separate question from whether.
	 * Candidates are the places a reader would accept one: after punctuation, and at a space.
	 * **Balanced rather than first-line-filled** -- see spec/architecture/video/captions.md, "A
	 * caption is set in the page's voice and placed in the black", for why filling strands a word.
	 * Failing `FILL` entirely, the shortest first line under `KEEP` is taken instead, and failing
	 * that the text is left whole.
	 */
	function breakAt(text: string, measure: (value: string) => number, width: number): string {
		const candidates: { at: number; punctuated: boolean }[] = [];
		for (let i = 1; i < text.length; i++) {
			const before = text[i - 1] ?? '';
			const here = text[i] ?? '';
			const punctuated = /[,.;:!?—、。，；：！？]/.test(before);
			if (punctuated || here === ' ') candidates.push({ at: i, punctuated });
		}
		const scored = candidates
			.map((c) => ({ ...c, head: text.slice(0, c.at).trim(), tail: text.slice(c.at).trim() }))
			.filter((c) => c.head && c.tail)
			.map((c) => ({ ...c, size: measure(c.head) }));
		const weighed = scored
			.map((c) => ({ ...c, rest: measure(c.tail) }))
			.filter((c) => c.size <= width * CUE_FILL && c.rest <= width * CUE_FILL)
			.map((c) => ({
				...c,
				// Lower is better: how unequal the two lines are, less a nudge for stopping at a
				// clause rather than mid-sentence.
				cost: Math.abs(c.size - c.rest) - (c.punctuated ? width * CUE_NUDGE : 0),
			}));
		const chosen =
			weighed.sort((a, b) => a.cost - b.cost)[0] ??
			scored.filter((c) => c.size <= width * CUE_KEEP).sort((a, b) => a.size - b.size)[0];
		return chosen ? [chosen.head, chosen.tail].join('\n') : text;
	}

	function placeCaptions(): void {
		const element = video;
		if (!element) return;
		const box = element.getBoundingClientRect();
		if (!box.height || !element.videoWidth || !element.videoHeight) return;

		const shown = Math.min(box.height, (box.width * element.videoHeight) / element.videoWidth);
		const size = Math.min(CUE_MAX, Math.max(CUE_MIN, shown * CUE_SCALE));
		element.style.setProperty('--cue-size', `${Math.round(size)}px`);

		// `cover` fills the box, so the picture is the box and there is nothing to move out of.
		const fitted = getComputedStyle(element).objectFit === 'contain';
		const bar = fitted ? (box.height - shown) / 2 : 0;
		const block = size * CUE_BLOCK;
		// One expression for both places a caption can go, because the bar being absent and the
		// bar being too shallow want the same answer: the bottom of the picture, held off it.
		const bottom =
			bar >= block * CUE_ROOM
				? // Centred in the bar: half the leftover above the caption, half below.
					box.height - (bar - block) / 2
				: box.height - bar - size * CUE_CLEAR;
		const line = Math.min(100, Math.max(0, (bottom / box.height) * 100));

		// The picture's own width, not the box's: in full screen the bars are part of the element
		// and no part of what a caption has to fit across.
		const across = Math.min(box.width, (box.height * element.videoWidth) / element.videoHeight);
		ruler ??= document.createElement('canvas').getContext('2d');
		const face = getComputedStyle(element).fontFamily;
		if (ruler) ruler.font = `${size}px ${face}`;
		// Every measurement is of the padded line, because the padding is part of the plate and the
		// plate is what has to fit across the picture. Both halves of a break gain the same amount,
		// so the balance the break is chosen on is unaffected and only the thresholds move.
		const measure = (value: string) => ruler?.measureText(CUE_PAD + value + CUE_PAD).width ?? 0;
		const padded = (value: string) =>
			value
				.split('\n')
				.map((row) => CUE_PAD + row + CUE_PAD)
				.join('\n');

		for (const track of element.textTracks) {
			for (const cue of track.cues ?? []) {
				(cue as VTTCue).snapToLines = false;
				// Assigned before `line`, because `line` is validated against it.
				if ('lineAlign' in cue) (cue as VTTCue).lineAlign = 'end';
				(cue as VTTCue).line = line;

				if (!written.has(cue)) written.set(cue, (cue as VTTCue).text);
				const original = written.get(cue) ?? '';
				const joined = original.replaceAll('\n', ' ').replaceAll(/\s+/g, ' ').trim();
				if (!ruler || !joined) continue;
				(cue as VTTCue).text = padded(
					measure(joined) <= across * CUE_KEEP ? joined : breakAt(joined, measure, across),
				);
			}
		}
	}

	$effect(() => {
		const element = video;
		if (!element) return;
		// The shape, and only the shape. `filling` and `view.fullscreen` are read so this reruns
		// when either changes; the resize listener covers the window itself.
		void filling;
		void view.fullscreen;
		void view.hasCaptions;
		placeCaptions();
		const again = () => placeCaptions();
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

	/**
	 * A seek small enough to land inside the first frame, and large enough to be a seek.
	 *
	 * Assigning the position the element already reports is not a seek and decodes nothing, so a
	 * clip that has never moved needs a number that is not zero. A ten-thousandth of a second is
	 * inside frame zero at any frame rate anyone ships.
	 */
	const NUDGE = 0.0001;

	/**
	 * Decode one frame, so the element has something of its own to show, once the reader is
	 * anywhere near it. Tied to the viewport rather than the first `play`, which is the whole cost
	 * control: a range request per clip, spent only on clips a reader has actually scrolled to.
	 * See spec/architecture/video/player.md, "The poster is a fallback, and the wait is a blur", for
	 * why the poster alone is not enough.
	 */
	function prime(): void {
		if (!video || primed) return;
		// Once per source, tracked rather than inferred. It used to ask `readyState` whether a
		// frame was already there, and `readyState` does not answer that question: measured at 4
		// -- enough data for the whole clip -- with `totalVideoFrames` still 0, so it skipped the
		// seek, nothing ever decoded, and the thumbhash showed through the poster's absence.
		primed = true;
		const at = restored ?? 0;
		// Spent here rather than at `start`: the position has been applied, and applying it twice
		// would seek a clip the reader has just pressed play on.
		restored = undefined;
		seekTo(at > 0 ? at : NUDGE);
	}

	/**
	 * Seek, waiting for metadata if there is not yet a timeline to seek within.
	 *
	 * Assigning `currentTime` before metadata sets a default start position instead of seeking,
	 * which lands in the right place but never fires `seeked` -- and `seeked` is what tells
	 * `video.svelte` a frame has been put up.
	 */
	function seekTo(at: number): void {
		const element = video;
		if (!element) return;
		if (element.readyState >= HTMLMediaElement.HAVE_METADATA) element.currentTime = at;
		else
			element.addEventListener('loadedmetadata', () => void (element.currentTime = at), {
				once: true,
			});
	}

	/**
	 * Play, putting the clip back where the tab left it first.
	 *
	 * Every path to playback goes through here rather than calling the store directly, because a
	 * position restored on some of them and not others is worse than one restored on none.
	 */
	function start(): void {
		const at = restored;
		restored = undefined;
		if (at !== undefined) seekTo(at);
		void (player?.play as () => void)?.();
	}

	/**
	 * Record where the clip has got to, or forget it.
	 *
	 * The picture goes with the number, and that is the point of taking one at all: a reload that
	 * puts the clip back at fourteen seconds and blurs the *first* frame behind it while it
	 * decodes is showing the wrong place, and the blurred ground is the one thing on screen for
	 * that moment.
	 */
	function keep(): void {
		if (!video || !clip) return;
		kept = performance.now();
		keepPosition(sessionStorage, clip, video.currentTime, video.duration, stillOf(video));
	}

	/**
	 * How long the remembered frame is allowed to be out of date while a clip is running -- kept
	 * on `timeupdate` rather than an interval, since it fires only during playback and needs
	 * nothing unwound. See spec/architecture/video/player.md, "The poster is a fallback, and the wait
	 * is a blur", for why it also runs while playing (not only at `pause`/`ended`/`pagehide`)
	 * and for the cost measurement behind the two seconds.
	 */
	const KEEP_EVERY = 2000;
	let kept = 0;
	function keepWhileRunning(): void {
		if (performance.now() - kept < KEEP_EVERY) return;
		keep();
	}

	/**
	 * The last moment a phone reliably gives anybody.
	 *
	 * `pagehide` catches a reload and a deliberate close, and on a mobile browser it is not
	 * guaranteed to run before a backgrounded tab is thrown away. Going hidden is, and it is also
	 * exactly when a reader who switches away should have their place taken down.
	 */
	function keepOnHide(): void {
		if (document.visibilityState === 'hidden') keep();
	}

	$effect(() => {
		if (!video) return;
		const element = video;
		element.addEventListener('pause', keep);
		element.addEventListener('ended', keep);
		element.addEventListener('timeupdate', keepWhileRunning);
		window.addEventListener('pagehide', keep);
		document.addEventListener('visibilitychange', keepOnHide);
		return () => {
			element.removeEventListener('pause', keep);
			element.removeEventListener('ended', keep);
			element.removeEventListener('timeupdate', keepWhileRunning);
			window.removeEventListener('pagehide', keep);
			document.removeEventListener('visibilitychange', keepOnHide);
		};
	});

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
				if (entry?.isIntersecting) return void prime();
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
		if (view.pip) return void returnHere();
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

	/**
	 * The level, and the ceiling a reader may raise. `video.volume` is capped at 1, so anything
	 * above it needs a `GainNode` and therefore `crossorigin`. Built once, lazily, since
	 * `createMediaElementSource` takes the element's audio over for good with no way back --
	 * which two things can push past the cap: the reader's own ceiling, and a clip quiet enough
	 * that its levelling alone is above one.
	 */
	function applyVolume() {
		if (!video) return;
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

	/**
	 * Quality, which the store cannot do for us: `videoRenditionList` is filled by an engine that
	 * knows about renditions -- hls.js, dash.js -- and our ladder is separate progressive files,
	 * so nothing fills it (measured, length 0 with four rungs on the page). So the swap is ours:
	 * remember the position, change the source, put it back, resume if it was playing. The seek
	 * lands on the nearest keyframe, which is why this is the one control that interrupts itself.
	 */
	function quality(src: string) {
		if (!video) return;
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
	/**
	 * Whether the chrome is on screen: never in `sleeping` or `previewing`, and only `awake` shows
	 * it since only a click asked for it. A pointer device follows the pointer and nothing else; a
	 * touch device follows the taps counted in `press`. See spec/architecture/video/player.md, "On a
	 * pointer device", for why it does not also fade on an idle timer the way a native player's
	 * does.
	 */
	const shown = $derived(stage === 'awake' && (hovers ? over || menu : showChrome || menu));
	const label = $derived(
		view.paused ? m['video.play']({}, { locale }) : m['video.pause']({}, { locale }),
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
		!view.pip &&
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
		view.pip && styles.stillShown,
	).class}"
	aria-hidden="true"
></canvas>

{#if view.pip}
	<button
		type="button"
		onclick={(event) => {
			event.stopPropagation();
			returnHere();
		}}
		aria-label={m['video.exit-pip']({}, { locale })}
		title={m['video.exit-pip']({}, { locale })}
		class="player-cover pointer-events-auto absolute inset-0 m-auto grid size-16 cursor-pointer place-items-center {stylex.attrs(
			styles.cover,
			styles.coverShown,
		).class}"
	>
		<PictureInPictureIcon class="player-cover-glyph" weight="bold" aria-hidden="true" />
	</button>
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
			oninput={(event) =>
				(player?.seek as (value: number) => void)?.(Number(event.currentTarget.value))}
		/>
	</div>

	<div class="flex items-center gap-0.5 {stylex.attrs(styles.row).class}">
		<button
			type="button"
			class="player-button inline-grid size-7.5 cursor-pointer place-items-center {stylex.attrs(
				surfaces.focusRingHost,
				styles.button,
			).class}"
			onclick={toggle}
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
				onclick={unmute}
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
				oninput={(event) => setVolume(Number(event.currentTarget.value))}
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
				onclick={() => {
					// The reader's answer, and the only thing that writes it. The store is told by
					// the effect above rather than from here, so there is one path onto the clip
					// whether the answer arrives by a press now or out of the record at load.
					wantsCaptions = !wantsCaptions;
					reader.remember(localStorage, CAPTIONS_KEY, wantsCaptions);
				}}
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
					class="player-glyph player-glyph-cog focus-ring-inner {stylex.attrs(
						surfaces.focusRingInner,
					).class}"
					weight="bold"
					viewBox="-24.38 -24.38 304.76 304.76"
					aria-hidden="true"
				/>
			</button>
			{#if menu}
				<div
					class="absolute end-0 bottom-9 min-w-28 p-1 text-start {stylex.attrs(styles.menu).class}"
				>
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
								onclick={() => quality(rung.src)}
							>
								{rung.height}p
							</button>
						{/each}
					{/if}
					<p class="m-0 px-2 pt-1 pb-0.5 uppercase {stylex.attrs(styles.menuTitle).class}">
						{m['video.speed']({}, { locale })}
					</p>
					{#each [0.5, 1, 1.25, 1.5, 2] as rate (rate)}
						<button
							type="button"
							class="focus-ring block w-full cursor-pointer px-2 py-1 text-start {stylex.attrs(
								styles.menuItem,
								view.rate === rate && styles.menuItemOn,
							).class}"
							onclick={() => (player?.setPlaybackRate as (value: number) => void)?.(rate)}
						>
							{rate}&times;
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
						onclick={() => {
							boost = !boost;
							reader.remember(localStorage, BOOST_KEY, boost);
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
				class="player-button inline-grid size-7.5 cursor-pointer place-items-center {stylex.attrs(
					surfaces.focusRingHost,
					styles.button,
				).class}"
				onclick={() => (player?.togglePictureInPicture as () => void)?.()}
				aria-label={m['video.pip']({}, { locale })}
				title={m['video.pip']({}, { locale })}
			>
				<PictureInPictureIcon
					class="player-glyph focus-ring-inner {stylex.attrs(surfaces.focusRingInner).class}"
					weight="bold"
					aria-hidden="true"
				/>
			</button>
		{/if}

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
			onclick={() => (player?.toggleFullscreen as () => void)?.()}
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
	</div>
</div>

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
	   than control. See spec/styling/focus.md and styles/utilities.css for the measurement. */

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

	/* A hidden row is still a tab stop, so it also has to show itself: `:has(:focus-visible)`
	   rather than `:focus-within`, which would also pin the row open after a mouse click. Not
	   `html[data-focus-source='kbd']` either -- see spec/styling/focus.md, "`:focus-visible` is the
	   browser's guess, and the site keeps its own answer". Both declarations stay together because
	   the condition is a relation to a descendant, which no class carries -- see
	   spec/architecture/css/authoring.md, "An attribute selector is not a condition". */
	.player-chrome:has(:focus-visible) {
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

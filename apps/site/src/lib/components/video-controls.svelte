<script module lang="ts">
	/**
	 * Whether a reader has given this page permission to make noise.
	 *
	 * Module scope, so it is one fact for every clip on the page rather than one per clip. That is
	 * the point: the permission is the reader's and it was given to the *page*, not to the clip
	 * that happened to collect it. An engine takes the same view -- once a reader has clicked
	 * anywhere, `play()` with sound is allowed anywhere -- so a second clip that kept asking for
	 * silence would be obeying a rule nobody has.
	 *
	 * What it changes is only the first moment. A reader who has already unmuted one clip and then
	 * points at the next one gets it with sound, because they have said once already what they
	 * wanted and being asked again is the thing that annoys. A reader who has not gets silence, as
	 * they must.
	 *
	 * It does not grant chrome. Sound is a permission and the chrome is a request -- every clip
	 * still waits for a click of its own before it shows any.
	 *
	 * Never reset. There is no gesture that means "I withdraw consent to hear things", and
	 * muting a clip is not it.
	 */
	let unlocked = $state(false);
</script>

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
	//
	// Every glyph is `weight="fill"` except the boxes. `ClosedCaptioning`, `FrameCorners`,
	// `PictureInPicture` and `GearSix` all carry their meaning in an opening rather than in a mass
	// -- a frame is the hole inside it, a cog is the hole at its centre -- and filling them hands
	// back a rounded blob that says none of caption, window, window-within-window or settings.
	// Those are `bold`, the heaviest weight that keeps the opening.
	//
	// Three of the boxes are not Phosphor's at all, because Phosphor does not draw them: the
	// landscape corner pair and the frame's exit state. They live in `./video-glyphs`, are drawn
	// in the same hand, and take the same props minus `weight` -- bold is the only weight they
	// have.
	import ClosedCaptioningIcon from 'phosphor-svelte/lib/ClosedCaptioningIcon';
	import FrameCornersIcon from 'phosphor-svelte/lib/FrameCornersIcon';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
	import PictureInPictureIcon from 'phosphor-svelte/lib/PictureInPictureIcon';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import SpeakerHighIcon from 'phosphor-svelte/lib/SpeakerHighIcon';
	import SpeakerSimpleXIcon from 'phosphor-svelte/lib/SpeakerSimpleXIcon';
	// Three shapes Phosphor does not draw, in Phosphor's hand. See `video-glyphs/glyph.svelte`.
	import CornersInWideIcon from './video-glyphs/corners-in-wide.svelte';
	import CornersOutWideIcon from './video-glyphs/corners-out-wide.svelte';
	import FrameCornersInIcon from './video-glyphs/frame-corners-in.svelte';
	import { keepPosition, positionOf, stillOf } from '$lib/client/progress';
	import { reader } from '$lib/client/state';
	import type { VideoRung } from '$lib/content/build/assets.ts';
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
		 * The clip and the box around it, once there are any.
		 *
		 * Undefined on the server and for the first client render, which is the point of their
		 * being optional. This component used to be withheld until both were bound, so the cover
		 * -- the one part of it a reader sees before they touch anything -- did not exist until
		 * hydration and then appeared at full opacity: measured, nothing until 400ms and then a
		 * disc, against a first paint at 88ms. Rendering from the start means the server writes
		 * the same disc the client keeps, and there is nothing to appear.
		 *
		 * Everything that touches either one is an effect or a handler, so nothing runs until
		 * there is something to run against. The guards say so at each of them rather than being
		 * implied by a gate in the parent.
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
		volume = reader.recall(localStorage, VOLUME_KEY, DEFAULT_VOLUME);
		boost = reader.recall(localStorage, BOOST_KEY, false);
		wantsCaptions = reader.recall(localStorage, CAPTIONS_KEY, false);
	});

	/**
	 * Put the reader's answer to this clip, once this clip is in a position to be asked.
	 *
	 * **A clip with no tracks is not an answer.** It cannot show captions, so the store reports
	 * them as not showing, and a preference that mirrored the store would be turned off by every
	 * silent diagram and title card on the page -- the reader would have said "on" once and had it
	 * taken away by a clip that was never able to honour it. So the preference is only ever
	 * written by the button below, and only ever read here, where there is something to read it
	 * onto. A clip without tracks simply does not use the value, and leaves it exactly as it was
	 * for the next clip that can.
	 *
	 * `toggleSubtitles` rather than a setter, because that is what the store offers; the guard is
	 * what makes calling it idempotent.
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

	/**
	 * Where this clip was when the tab last saw it, applied at the last possible moment.
	 *
	 * Read once and spent once. It is deliberately not written to `currentTime` on load:
	 * `preload="metadata"` means the clip itself has not been fetched, and seeking a clip that
	 * nobody has played yet asks the CDN for a range around that offset -- three clips in an
	 * article would be three wasted requests on every page view for a reader who watches none of
	 * them. So it waits for the first `play`, which is the first moment it costs anything to be
	 * right about.
	 */
	let restored: number | undefined;
	$effect(() => {
		restored = positionOf(sessionStorage, clip)?.at;
		const element = video;
		if (restored === undefined || !element) return;
		/**
		 * A clip this tab has already watched seeks the moment it has a timeline to seek within,
		 * rather than waiting to be scrolled to.
		 *
		 * Waiting costs a wrong frame in front of the reader. Left alone, an element with metadata
		 * decodes and paints frame zero by itself, and the seek then replaces it: measured, frame
		 * zero presented at 112ms against a first paint at 92ms, and the remembered frame not
		 * until 337ms. A quarter of a second of the wrong picture, which is the cover the blur was
		 * put there to avoid showing.
		 *
		 * Seeking at `loadedmetadata` gets in first. The element has no frame at that point, so
		 * the first one it ever decodes for display is the one that was asked for, and frame zero
		 * is never painted at all.
		 *
		 * The viewport rule still governs every clip without a remembered position, which is the
		 * one whose cost it was protecting: a clip nobody has watched has nowhere in particular to
		 * be, and frame zero is the right frame for it.
		 */
		const early = () => prime();
		if (element.readyState >= HTMLMediaElement.HAVE_METADATA) early();
		else element.addEventListener('loadedmetadata', early, { once: true });
		return () => element.removeEventListener('loadedmetadata', early);
	});

	/**
	 * The frame the clip was on when it left for the picture-in-picture window.
	 *
	 * An element in picture-in-picture paints nothing where it stands: the browser puts its own
	 * placeholder there, a black box with a line of text, and until the poster was dropped it
	 * painted that over the poster -- so the reader was shown a still of the first frame, dimmed,
	 * for a clip that was twelve seconds in somewhere else. Neither the black nor the first frame
	 * is what left.
	 *
	 * So the moment it leaves, the frame it leaves on is copied into a canvas, and the canvas is
	 * what stands in for it. Drawn from the element rather than from the poster, which is the
	 * whole point: it is the picture that was actually there. Grey, because it is not the live
	 * one -- the live one is in the other window, and a full-colour still would claim otherwise.
	 *
	 * The canvas is always in the DOM rather than conditional on the state, because the state and
	 * the drawing arrive in the wrong order: `enterpictureinpicture` is where the frame is still
	 * available, and a canvas mounted by that same state would not exist yet.
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
	 * In an article there is nothing to decide. The frame is 16:9 and the picture is cropped to
	 * fill it, so there are no bars and a caption along the bottom of the picture is a caption
	 * along the bottom of the box. Full screen is where it matters: the picture is fitted rather
	 * than cropped, so a window that is not the clip's shape leaves black above and below, and a
	 * caption drawn at the bottom of the *picture* covers picture that did not need covering.
	 *
	 * **So the bar is measured, and it gets the caption only if it is comfortably bigger than
	 * one.** Fitting is not the test: a bar the size of the caption holds it the way a shelf holds
	 * a book that is exactly as tall, which is to say with the caption jammed against both edges
	 * and reading as an accident. `CUE_ROOM` is how much bigger than the caption the bar has to
	 * be before it is worth using at all, and the caption is then centred in it, obscuring
	 * nothing. Anything shallower than that does not get the caption even though the caption
	 * would technically fit, and it goes over the picture instead.
	 *
	 * Cues are positioned against the *element* box rather than the picture, which is what makes
	 * any of this reachable: `line` as a percentage of a box that includes the bars can put a cue
	 * in them. The files already say `line:96.5%,end`, so `lineAlign` is `end` and `line` names
	 * the bottom edge of the cue box -- which is the edge worth naming, since it is the one that
	 * has to clear the picture.
	 *
	 * **Recomputed on shape, never on cues.** A caption is one line or two and nobody knows which
	 * until it arrives; measuring each one would move every caption to a slightly different place
	 * and read as jitter. So the height allowed for is the worst case, two lines, and the answer
	 * is recomputed only when the shape it was computed from changes: the window resizing, and
	 * either full screen being entered or left. Within one shape that worst case does not move,
	 * which is what makes it something the bar can be measured against.
	 */
	const CUE_LINES = 2;
	/**
	 * The caption's own height, in multiples of the size it is set at.
	 *
	 * It is the line boxes and nothing else: 1.35 is the `line-height` `video.svelte` gives
	 * `::cue`, and the plate is painted to exactly that box rather than around it. Measured on a
	 * 668px frame at 16px, a one-line plate is 653.0 to 675.0 -- 22px against the 21.6 the
	 * line-height asks for -- and on a 448px frame at 14px a two-line plate is 530.5 to 568.5,
	 * 38px against 37.8. This used to carry an extra 0.4 for what the plate was said to add above
	 * and below, and the plate adds nothing; the allowance was 6px of fiction at 16px and 12px at
	 * 30px, and it pushed every centred caption that much below the middle of the bar.
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
	 * How far above the picture's bottom edge a caption sits when it is on the picture.
	 *
	 * Also in multiples of the caption's size, because that is what the gap is read against: the
	 * same gap under a caption twice the size looks half as much. The old rule was 3.5% of the
	 * *element*, which is a different quantity in every shape -- 13.2px in an article, 35px in a
	 * 1000px-tall window, and exactly 0 where the picture was fitted and the bar too shallow,
	 * where the caption was drawn flush with the bottom of the picture and its descenders were
	 * cut by the letterbox. At 0.8 the article keeps the gap it has always had, 12.8px against
	 * the 13.2 the percentage gave, and every other shape gets that same gap in proportion.
	 */
	const CUE_CLEAR = 0.8;
	/** A caption reads at a size taken from the picture, between these two. */
	const CUE_MIN = 14;
	const CUE_MAX = 30;
	const CUE_SCALE = 0.042;

	/**
	 * How much of the picture a caption may fill before it is worth breaking, and how full the
	 * first line is aimed at when it is.
	 *
	 * The files arrive already broken, and they are broken for a column narrower than most of the
	 * places they are shown: a caption that would sit comfortably across two thirds of the picture
	 * is cut in half anyway. So the break in the file is treated as a suggestion about *where*
	 * rather than an instruction to break at all.
	 *
	 * `KEEP` is the only thing that decides whether. A caption that fits within it stays on one
	 * line however the file was written. Above it the caption breaks, and `FILL` is what the first
	 * line aims at -- short of `KEEP`, so that a break leaves a visibly unfinished first line
	 * rather than one that looks like it only just failed.
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
	 *
	 * Candidates are the places a reader would accept a break: after punctuation, and at a space.
	 *
	 * **The two lines are balanced rather than the first one filled.** Filling the first line is
	 * the obvious rule and it is wrong: it strands whatever is left. Measured on a 452px picture,
	 * it broke "A car drives down the highway, then it disappears into a tunnel." at 358 and 61,
	 * leaving a second line of two words -- the shape a caption should never take, and the reason
	 * a stranded word was called out as expensive in the first place. Choosing the break that
	 * makes the two lines most nearly equal puts it after "highway," instead, at 190 and 229.
	 *
	 * Punctuation is worth a nudge rather than a veto: a clause boundary is a better place to stop
	 * than an arbitrary word boundary, but not at the cost of two lines that do not match.
	 *
	 * Where nothing leaves both lines under `FILL` -- one very long word, or a script that does
	 * not space -- the shortest first line under `KEEP` is taken instead, and failing that the
	 * text is left whole for the browser to break as it sees fit.
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
		const measure = (value: string) => ruler?.measureText(value).width ?? 0;

		for (const track of element.textTracks) {
			for (const cue of track.cues ?? []) {
				cue.snapToLines = false;
				// Assigned before `line`, because `line` is validated against it.
				if ('lineAlign' in cue) (cue as VTTCue).lineAlign = 'end';
				cue.line = line;

				if (!written.has(cue)) written.set(cue, (cue as VTTCue).text);
				const original = written.get(cue) ?? '';
				const joined = original.replaceAll('\n', ' ').replaceAll(/\s+/g, ' ').trim();
				if (!ruler || !joined) continue;
				(cue as VTTCue).text =
					measure(joined) <= across * CUE_KEEP ? joined : breakAt(joined, measure, across);
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
	 * Decode one frame, so the element has something of its own to show.
	 *
	 * The poster is cut from this clip and still does not match it -- see `video.svelte` -- so the
	 * element is asked for the real thing as soon as the reader is anywhere near it. A seek is
	 * what asks: the browser fetches a range around that offset, decodes, and paints it, and the
	 * poster stops being used because there is now a frame.
	 *
	 * **Tied to the viewport, which is the whole cost control.** This is a range request per clip,
	 * so it is spent on clips a reader has actually scrolled to and on no others. It also revises
	 * a decision from the commit that added restoring: that waited for the first `play`, on the
	 * grounds that a clip nobody watches should cost nothing. It still costs nothing; "nobody
	 * watches" is now "nobody scrolls to", which is the point at which a reader can see the clip
	 * and therefore the point at which the frame has to be the right one.
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
		else element.addEventListener('loadedmetadata', () => void (element.currentTime = at), {
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
	 * How long the remembered frame is allowed to be out of date while a clip is running.
	 *
	 * **The record used to be written only where the position stopped changing** -- `pause`,
	 * `ended`, `pagehide` -- on the argument that a number is worth keeping when it settles. That
	 * was an argument about a number, and the entry is now a number and a picture of it. A clip
	 * whose tab is discarded, whose device sleeps, or that is closed by anything that does not get
	 * as far as `pagehide` leaves either a frame from wherever it was last paused or, for a clip
	 * played straight through from the start, nothing at all.
	 *
	 * So it is also kept while it runs. `timeupdate` is the clock rather than an interval of this
	 * file's own: it fires only during playback, stops on its own at every pause, seek and stall,
	 * and needs nothing unwound. At roughly four a second it is far more often than this wants,
	 * so it is thinned to one keep every two seconds of wall clock.
	 *
	 * **Two seconds, because the still is what costs something.** Measured on a 1080p clip in this
	 * article: the canvas draw and `toDataURL` are 1.59ms, and the read, parse, edit and stringify
	 * of the whole record are 0.01ms -- the storage write, which is what the old comment here
	 * worried about, is a rounding error next to the picture. Every `timeupdate` would be 6.4ms in
	 * every second of playback; one in eight is 0.8ms, which is under a tenth of a frame's budget
	 * and buys a remembered picture that is never more than two seconds stale.
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
	 * Waking a clip on a touch device, and keeping it on screen.
	 *
	 * Two things start a preview. A pointer arriving is one. The other is a finger pressing the
	 * clip and wandering -- far enough that the platform drops its long-press menu, not far enough
	 * to be a tap, and never lifting into one. That state is reachable and it is the closest thing
	 * a touch device has to hovering.
	 *
	 * **A touch preview is not held by anything, and that is the one place the two devices part.**
	 * A pointer can leave a clip while the reader stays on the page, so a pointer leaving means
	 * something and stops the preview. A finger lifting means nothing of the kind -- it is how
	 * every gesture on a touch device ends -- so a preview there runs until the clip leaves the
	 * screen, which is the only signal that says the reader has moved on.
	 *
	 * Coming back does not restart it either way: the pause is a pause and the reader decides.
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
			// **A preview lasts as long as the pointer does.** It was never asked for -- it started
			// because a pointer happened to arrive -- so it has no business continuing once that
			// is no longer true, and a page where three clips play on in three places the reader
			// is not looking is the thing this is avoiding. Paused, not stopped: the position is
			// what makes coming back a resumption rather than a restart.
			//
			// Only a preview. An `awake` clip was asked for and keeps playing wherever the pointer
			// goes, which is the difference the click buys.
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
		if (!video) return;
		// While it is playing somewhere else, pressing the picture can only mean one thing.
		if (view.pip) return void returnHere();
		if (stage !== 'awake') {
			wake();
			showChrome = true;
			// The click that buys sound is the one moment the whole interface should answer: the
			// row along the bottom and the disc in the middle together, so the reader sees the
			// picture become a player rather than only a strip at the bottom growing controls.
			// `hold` rather than anything sticky, so it is an announcement and then the ordinary
			// rules -- the disc counts itself down from here like any other state change.
			//
			// It needs saying because the usual trigger does not fire here. A pointer arriving
			// already started the silent preview, so the clip is running before and after the
			// click and `paused` never changes; without this the click showed the row and left
			// the middle of the picture empty.
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
		if (next > 0 && video.muted) video.muted = false;
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
	 * Whether the chrome is on screen, which is a different question on the two devices.
	 *
	 * `sleeping` and `previewing` never show it: a clip that looks like a picture has no controls,
	 * and one running silently is an invitation rather than a player. Only `awake` has chrome at
	 * all, and only because the reader asked for it.
	 *
	 * Once awake, a pointer device follows the pointer and nothing else: the chrome is there while
	 * the pointer is on the frame and gone when it leaves. It used to fade on `userActive` too,
	 * the way a native player's does, and that is the wrong borrowing -- a native player fills the
	 * screen and its chrome is the only thing between the reader and the picture, where this one
	 * is a 672px box in a column of prose that the reader is deliberately pointing at. A scrubber
	 * that disappears under a resting pointer has to be summoned back by wiggling it.
	 *
	 * A touch device has no pointer to follow, so it follows the taps counted in `press`.
	 */
	const shown = $derived(
		stage === 'awake' && (hovers ? over || menu : showChrome || menu),
	);
	const label = $derived(
		view.paused ? m['video.play']({}, { locale }) : m['video.pause']({}, { locale }),
	);

	/**
	 * Whether the cover is asking to be seen. Whether it exists at all is the markup's question.
	 *
	 * Three answers, because the cover is answering three different questions.
	 *
	 * Before the reader has clicked, on a pointer device, it is the sign on a still picture -- so
	 * it is there while the pointer is elsewhere and gone the moment the pointer arrives, because
	 * from then on the picture is moving and the movement is the better sign. `over` rather than
	 * the stage, so it comes straight back when the pointer leaves.
	 *
	 * After the reader has clicked it is the play control, and where the pointer is decides which
	 * of two things it is.
	 *
	 * With the pointer on the frame there is a whole row of controls along the bottom and this one
	 * is sitting over the middle of the picture, so it is a guest: it comes up for the moment a
	 * state changes, holds while the pointer is on it, and otherwise gets out of the way. That
	 * includes paused, which used to keep it up outright -- but a reader who paused with the
	 * pointer on the frame has the row in front of them and does not need the picture covered too.
	 *
	 * With the pointer off the frame the row is gone and this is the only control there is, so
	 * what it does depends on whether there is anything to do. A clip still running -- and an
	 * awake one does keep running, since only a preview ends with the pointer -- needs nothing
	 * from the reader, and takes the countdown like any other state. A paused still frame with
	 * nothing on it says nothing about being resumable, so there it stays, indefinitely.
	 *
	 * Both edges are countdowns rather than switches. Arriving does not clear the middle of the
	 * picture in the same frame the row appears in, because two things changing in opposite
	 * directions at once reads as a flinch; leaving does not clear it at all while the clip is
	 * running. Each edge restarts the timer and lets the answer settle a moment later.
	 *
	 * On a touch device it is still only the invitation. There is no hover to replace it with, and
	 * a permanent target in the middle of the picture would fight the double tap that pauses.
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
	 * What the cover is drawn as, which is not the same question as whether the clip is running.
	 *
	 * Before the first click the cover is an invitation and an invitation has one face. The clip
	 * underneath does start and stop in that stage -- a pointer arriving begins the silent preview
	 * and a pointer leaving ends it -- and reading `paused` directly meant the glyph reported it:
	 * arriving, the triangle became two bars for the length of the fade and then went, so the
	 * reader saw a pause button flash on a clip they had not started. The fade is 200ms and that
	 * is long enough to be seen rather than felt.
	 *
	 * Ordering the two would not fix it either, because the cover is not always leaving when the
	 * state changes. The state simply is not the cover's to report yet. Once the reader has
	 * clicked it becomes the play control and reports honestly, which is the point at which there
	 * is something to report.
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

	/** Whether the pointer is on the cover itself, which is not the same as being on the frame. */
	let onCover = $state(false);
	/** Whether the countdown started by the last state change is still running. */
	let lingering = $state(false);
	let linger: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Restart the countdown.
	 *
	 * The store has an idle flag of its own and it is the wrong clock for this. `userActive`
	 * resets on any movement inside the container, so a pointer wandering across the picture --
	 * which is what a reader watching a clip does -- kept bringing the Pause button back into the
	 * middle of it. The cover is one 64px disc and the only movement that should concern it is
	 * movement on the disc.
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
	The cover, and the only thing that ever covers the picture. A plate rather than a bare glyph,
	because on a frame this site does not choose a glyph alone has nothing to sit against.

	It answers the same question on both kinds of device and the question is asked at opposite
	ends of the interaction, which is why the condition is not one expression.

	A finger cannot arrive anywhere, so before a touch reader has touched it a clip with nothing on
	it is a picture as far as anyone can tell, and this is the only thing that says otherwise. It
	goes as soon as it has been used, because from then on the clip has said what it is.

	A pointer discovers the clip by arriving at it -- the picture starts moving, and that is the
	invitation, so there is nothing for a cover to say while the clip is asleep or previewing. The
	question comes back at the far end. Once the reader has clicked, the clip is a player rather
	than a picture, and a paused player with the chrome faded out is a still frame again with
	nothing anywhere saying it can be resumed. So the cover returns and stays: not while the
	pointer is over the frame, which is what the row already covers, but whenever it is paused.
-->
<!--
	What stands where the clip stands while the clip is somewhere else.

	Always in the DOM, because the frame has to be copied at `enterpictureinpicture` and a canvas
	conditional on the state would not exist until after it. Shown only while the state says so.
-->
<canvas bind:this={still} class="player-still" class:player-still-shown={view.pip} aria-hidden="true"
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
		class="player-cover player-cover-shown"
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
		class="player-cover"
		class:player-cover-shown={covered}
	>
		{#if coverRunning}<PauseIcon class="player-cover-pause" weight="fill" aria-hidden="true" />
		{:else}<PlayIcon class="player-cover-glyph" weight="fill" aria-hidden="true" />{/if}
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
			{#if view.paused}<PlayIcon class="player-glyph player-glyph-play focus-ring-inner" weight="fill" aria-hidden="true" />
			{:else}<PauseIcon class="player-glyph focus-ring-inner" weight="fill" aria-hidden="true" />{/if}
		</button>

		<div class="player-volume">
			<button
				type="button"
				class="player-button"
				onclick={unmute}
				aria-label={m['video.mute']({}, { locale })}
				title={m['video.mute']({}, { locale })}
			>
				{#if view.muted || volume === 0}<SpeakerSimpleXIcon class="player-glyph focus-ring-inner" weight="fill" aria-hidden="true" />
				{:else}<SpeakerHighIcon class="player-glyph focus-ring-inner" weight="fill" aria-hidden="true" />{/if}
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
				<ClosedCaptioningIcon class="player-glyph focus-ring-inner" weight="bold" aria-hidden="true" />
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
				<!--
					The one glyph in the row that is round, sized by eye rather than by its box.

					Every other glyph here is a landscape rectangle: measured off their paths, the
					neighbours are 216 units wide and 168 tall in a 256 box, which is 13.5 by 10.5
					at the 16px they render. A cog has one number instead of two, and Phosphor
					draws `GearSix` at 232 by 216 -- so at the same nominal size its diameter is
					wider than their width and a third again their height, and it reads as the big
					one in the row.

					A diameter is comparable to a rectangle at the number between the rectangle's
					two, so the drawing comes down by growing the canvas under it rather than by
					shrinking the element. The element stays 16 by 16, which is what the focus ring
					is on, so the ring is identical to every other one in the row. Props are spread
					after `viewBox` in Phosphor's generated components, so this replaces theirs.

					Shrinking a drawing shrinks its strokes with it, which the first version of
					this did and it showed: a cog the right size drawn in a lighter hand than the
					six glyphs beside it. The stroke is put back in `.player-glyph-cog`, and the
					two corrections are solved together rather than in sequence, because each
					changes what the other needs. See spec/styling.md for the arithmetic.
				-->
				<GearSixIcon
					class="player-glyph player-glyph-cog focus-ring-inner"
					weight="bold"
					viewBox="-24.38 -24.38 304.76 304.76"
					aria-hidden="true"
				/>
			</button>
			{#if menu}
				<div class="player-menu">
					{#if rungs && rungs.length > 1}
						<p class="player-menu-title">{m['video.quality']({}, { locale })}</p>
						{#each rungs as rung (rung.src)}
							<button
								type="button"
								class="player-menu-item focus-ring"
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
							class="player-menu-item focus-ring"
							class:player-on={view.rate === rate}
							onclick={() => (player?.setPlaybackRate as (value: number) => void)?.(rate)}
						>
							{rate}&times;
						</button>
					{/each}
					<p class="player-menu-title">{m['video.boost']({}, { locale })}</p>
					<button
						type="button"
						class="player-menu-item focus-ring"
						class:player-on={boost}
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
				class="player-button"
				onclick={() => (player?.togglePictureInPicture as () => void)?.()}
				aria-label={m['video.pip']({}, { locale })}
				title={m['video.pip']({}, { locale })}
			>
				<PictureInPictureIcon class="player-glyph focus-ring-inner" weight="bold" aria-hidden="true" />
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
			{#if filling}<FrameCornersInIcon class="player-glyph focus-ring-inner" aria-hidden="true" />
			{:else}<FrameCornersIcon class="player-glyph focus-ring-inner" weight="bold" aria-hidden="true" />{/if}
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
			{#if view.fullscreen}<CornersInWideIcon class="player-glyph focus-ring-inner" aria-hidden="true" />
			{:else}<CornersOutWideIcon class="player-glyph focus-ring-inner" aria-hidden="true" />{/if}
		</button>
	</div>
</div>

<style>
	/* Every control here opts into the site's keyboard indicator by name, which is the one part of
	   this player deliberately the page's and not its own: the accent outline, flush, suppressed
	   when the tracker knows the last input was a pointer, and with its colour stated at rest so
	   nothing interpolates into it. A base-layer rule would have drawn the same outline anyway,
	   but that rule is the backstop for a control nobody gave a utility to, and reaching it
	   silently is not the same as opting in.

	   Which utility depends on what the control's visible edge is. The cover is a circle, the
	   menu rows are rows, and a range input's track is the width it occupies, so those take
	   `focus-ring` on themselves. A button in the row is 30px around a 16px glyph, and the 7px on
	   each side is hit target rather than control: the thing a reader sees and is being pointed at
	   is the glyph. So those hand the outline to the glyph with `focus-ring-inner`.

	   Measured before the change, on the landscape box glyphs -- captions, picture-in-picture, the
	   two frames -- the ink is about 10.5px tall inside a 16px box inside a 30px button, so the
	   ring stood 9.3px clear of anything drawn. The site's other icon button, the section-link
	   copy, is 24px around the same 16px box and stands 6px clear. Phosphor was not the cause:
	   its bold glyphs fill 84-91% of their viewBox where mingcute's fill 67-75%, so they sit
	   tighter in their box than the rest of the site's, not looser. It was the hit target.
	   See spec/styling.md and styles/utilities.css. */

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
		background: var(--player-glass);
		backdrop-filter: blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate));
		-webkit-backdrop-filter: blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate));
		/* Hidden by default and faded in, on the chrome's curve and duration, because after the
		   first click the two leave together: a clip playing to nobody drops its whole interface
		   at once rather than in two steps. */
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 200ms cubic-bezier(0.4, 0, 0.2, 1),
			transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* `:focus-visible` for the reason the chrome has it: an invisible button is still a tab stop,
	   and a focus ring drawn on a control nobody can see is worse than no ring. */
	.player-cover-shown,
	.player-cover:focus-visible {
		opacity: 1;
		pointer-events: auto;
	}

	/* The cover's ring is drawn on the glyph and follows its actual shape, not a box around it.

	   Everywhere else on this site the ring is a rectangle, because everywhere else the control is
	   one. This control is a 64px disc holding a 30px glyph, and neither of the two rectangles is
	   the thing being pointed at: the disc is the plate the glyph sits on, and a box around the
	   glyph is 30px of which nine tenths is empty in one corner or another. So the outline becomes
	   an actual stroke on the path -- two closed rings around the pause bars, one around the
	   triangle, nothing around the disc.

	   `paint-order: stroke fill` is what makes it read as an outline rather than a thickening: the
	   stroke goes down first and the fill covers its inner half, so a stroke of 2w shows w outside
	   the shape. w is the site's 0.125rem, so the stroke is 0.25rem, which at this glyph's scale
	   -- 30px drawn from a 256 canvas -- is 42.67 user units.

	   The glyph is a component's element, so this reaches it through `:global`, and the stroke
	   inherits down to the path from the svg. Phosphor's transparent sizing rect would inherit it
	   too, which is why it is turned off, exactly as the cog's weight correction has to. */
	.player-cover:focus-visible {
		outline: none;
	}

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

	.player-cover:hover {
		transform: scale(1.05);
	}

	/* Optical centring, which Phosphor has already done and this file used to do again.

	   A triangle carries its mass behind its point, so a box drawn around it sits right of where
	   the eye puts the shape, and something has to move. Measured by sampling the outline and
	   taking the area centroid off the shoelace: `Play` at fill weight has its bounding box at x
	   64..240, centre 152, and its centroid at 127.65 -- so the set drew the path 24 units off its
	   own box on purpose, and the centroid is already on the viewBox's centre line. `Pause` is two
	   equal bars at 40..108 and 148..216, symmetric about 128, and needs nothing.

	   The `translate` that used to be here was therefore a correction on top of a correction, and
	   pushed the triangle a pixel and a bit past centre. Both glyphs are now placed by the grid
	   and nothing else. The rule stays, with the numbers in it, because "no offset" is a result
	   here and not an omission. */
	.player-cover :global(.player-cover-glyph),
	.player-cover :global(.player-cover-pause) {
		/* Against the 4rem disc this is a triangle 38% of the diameter tall, which is where a
		   native play button sits. At 1.5rem it was 30% and the disc read as the bigger object. */
		width: 1.875rem;
		height: 1.875rem;
		fill: currentColor;
		filter: drop-shadow(var(--player-shadow));
	}

	/* The still, filling the frame exactly as the element it stands in for does -- same box, same
	   crop -- so nothing moves when one replaces the other.

	   Grey and slightly dimmed, which is the whole message: this is a picture of the clip and not
	   the clip. Above the element rather than instead of it, because the browser paints its own
	   placeholder inside the element and there is no selector that reaches it. */
	.player-still {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: grayscale(1) brightness(0.55);
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.player-still-shown {
		opacity: 1;
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

	/* A hidden row is still a tab stop, so it also has to be able to show itself.

	   `opacity: 0` hides the chrome and leaves every button focusable, and until this rule the
	   result was a two-pixel accent rectangle drawn on the picture with nothing inside it: the
	   ring was doing its job and the control it pointed at was invisible. Nobody saw it before the
	   plate came off the buttons, because the plate was equally invisible.

	   `:has(:focus-visible)` rather than `:focus-within`, which would also match a click and pin
	   the row open after a press -- Chrome does not match `:focus-visible` on a mouse-clicked
	   button. And rather than `html[data-focus-source='kbd']`, which is the spelling
	   spec/styling.md warns against: written as a keyboard requirement it fails silent when the
	   tracker is absent, and silent here means a focused control nobody can see. */
	.player-chrome-shown,
	.player-chrome:has(:focus-visible) {
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
		transition: color 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Hover lights the glyph and draws nothing behind it.

	   A plate under each control was the first spelling and it was wrong twice over. The row
	   already sits on `--player-veil`, so a second translucent surface inside it is a plate on a
	   plate; and a rounded rectangle appearing behind a 16px glyph is a bigger visual event than
	   the state it reports. `--player-ink-dim` to `--player-ink` is the whole signal, which is
	   what a native player does. The wash stays for the menu, where a highlighted row is the
	   convention and the surface is the row rather than an ornament on it. */
	.player-button:hover,
	.player-button:focus-visible {
		color: var(--player-ink);
	}

	.player-button.player-on {
		color: var(--player-ink);
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

	/* The other half of the cog's optical correction, which the markup explains the reason for.
	
	   A filled path has no stroke to thicken, so the weight comes back as an actual stroke laid
	   along the outline it already has: `stroke-width` of w units adds w to the apparent thickness
	   and w/2 to every edge. Solving the pair -- stroke back to 1.5px, mean diameter still 12.0px
	   -- gives w = 4.571 and a 304.76 canvas, which is the `viewBox` in the markup.
	
	   `stroke` inherits, and Phosphor's transparent sizing rect would inherit it too and draw a
	   square around the glyph. It is turned off here rather than avoided, because a presentation
	   attribute on that rect is not something this file can reach. */
	.player-button :global(.player-glyph-cog) {
		stroke: currentColor;
		stroke-width: 4.571px;
		stroke-linejoin: round;
	}

	.player-button :global(.player-glyph-cog rect) {
		stroke: none;
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

	/* Both sliders hand their ring to the bar a reader can actually see.

	   An input here is 16px tall and the bar inside it is 3px, the rest being the hit area a thumb
	   needs, so a ring on the input stands five pixels clear of anything drawn and reads as a box
	   floating on the picture. This is the same call `focus-ring-inner` makes for the icon buttons
	   and the same one the table of contents makes for its collapsed bars, and neither utility
	   reaches here: an `<input>` has no children to hand the ring to, and the element that draws
	   the seek bar is its sibling rather than its ancestor. So the two placements are written out
	   below -- a sibling for one, a shadow pseudo-element for the other -- and they are the whole
	   of what is local. The colour, the width and the offset are still the site's.

	   Stated at rest as well, which is the rule for any value a state introduces: nothing here
	   transitions `outline-color` today, and the next person to add a transition should not have
	   to know that. */
	.player-track,
	.player-seek,
	.player-level {
		outline-color: var(--color-accent);
	}

	/* The input keeps the focus and gives up the drawing, which is the narrow case
	   spec/styling.md allows suppression for: something else marks the position. */
	.player-seek:focus-visible,
	.player-level:focus-visible {
		outline: none;
	}

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
		background: var(--player-glass);
		backdrop-filter: blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate));
		-webkit-backdrop-filter: blur(var(--player-glass-blur)) saturate(var(--player-glass-saturate));
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

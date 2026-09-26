/**
 * Where a clip is, kept for the tab: put back once the reader is near it, seeked to before the
 * first frame shows, and taken down whenever the clip stops or the tab goes. Built once per clip
 * by `video-controls.svelte`, while it initializes, and its effects are that component's. See
 * spec/architecture/video/player.md, "A reload finds a clip where the tab left it".
 */
import { keepPosition, positionOf, stillOf } from '@canmi/behavior/progress';

/**
 * A seek small enough to land inside the first frame, and large enough to be a seek.
 *
 * Assigning the position the element already reports is not a seek and decodes nothing, so a
 * clip that has never moved needs a number that is not zero. A ten-thousandth of a second is
 * inside frame zero at any frame rate anyone ships.
 */
const NUDGE = 0.0001;

/**
 * How long the remembered frame is allowed to be out of date while a clip is running -- kept
 * on `timeupdate` rather than an interval, since it fires only during playback and needs
 * nothing unwound. See spec/architecture/video/player.md, "The poster is a fallback, and the wait
 * is a blur", for why it also runs while playing (not only at `pause`/`ended`/`pagehide`)
 * and for the cost measurement behind the two seconds.
 */
const KEEP_EVERY = 2000;

export class Place {
	/**
	 * Where this clip was when the tab last saw it, applied at the last possible moment -- read
	 * once and spent once. See spec/architecture/video/player.md, "A reload finds a clip where the
	 * tab left it", for why it waits for the viewport rather than load or the first `play`.
	 */
	#restored: number | undefined;
	/**
	 * Whether this source has already been asked for a frame.
	 *
	 * Reset when the element takes a new one -- a rung swap calls `load()`, which throws away
	 * whatever was decoded -- so the replacement is asked for a frame of its own.
	 */
	#primed = false;
	#kept = 0;
	readonly #video: () => HTMLVideoElement | undefined;
	readonly #clip: () => string;

	constructor(video: () => HTMLVideoElement | undefined, clip: () => string) {
		this.#video = video;
		this.#clip = clip;

		$effect(() => {
			this.#restored = positionOf(sessionStorage, this.#clip())?.at;
			const element = this.#video();
			if (this.#restored === undefined || !element) return;
			/**
			 * A clip this tab has already watched seeks at `loadedmetadata`, before the element
			 * decodes its own frame -- narrowing the frame-zero flash, not closing it: a cached clip
			 * can decode frame zero before hydration runs, a race script cannot win. What actually
			 * hides it is the transparency hold; see spec/architecture/video/player.md, "A clip the
			 * tab remembers does not show itself until the frame is the right one" for the measured
			 * 100ms/80ms/315ms. Clips with no remembered position still wait, per `prime` below.
			 */
			const early = () => this.prime();
			if (element.readyState >= HTMLMediaElement.HAVE_METADATA) early();
			else element.addEventListener('loadedmetadata', early, { once: true });
			return () => element.removeEventListener('loadedmetadata', early);
		});

		$effect(() => {
			const element = this.#video();
			if (!element) return;
			const again = () => {
				this.#primed = false;
			};
			element.addEventListener('emptied', again);
			element.addEventListener('loadstart', again);
			return () => {
				element.removeEventListener('emptied', again);
				element.removeEventListener('loadstart', again);
			};
		});

		$effect(() => {
			const element = this.#video();
			if (!element) return;
			element.addEventListener('pause', this.#keep);
			element.addEventListener('ended', this.#keep);
			element.addEventListener('timeupdate', this.#keepWhileRunning);
			window.addEventListener('pagehide', this.#keep);
			document.addEventListener('visibilitychange', this.#keepOnHide);
			return () => {
				element.removeEventListener('pause', this.#keep);
				element.removeEventListener('ended', this.#keep);
				element.removeEventListener('timeupdate', this.#keepWhileRunning);
				window.removeEventListener('pagehide', this.#keep);
				document.removeEventListener('visibilitychange', this.#keepOnHide);
			};
		});
	}

	/**
	 * Decode one frame, so the element has something of its own to show, once the reader is
	 * anywhere near it. Tied to the viewport rather than the first `play`, which is the whole cost
	 * control: a range request per clip, spent only on clips a reader has actually scrolled to.
	 * See spec/architecture/video/player.md, "The poster is a fallback, and the wait is a blur", for
	 * why the poster alone is not enough.
	 */
	prime(): void {
		if (!this.#video() || this.#primed) return;
		// Once per source, tracked rather than inferred. It used to ask `readyState` whether a
		// frame was already there, and `readyState` does not answer that question: measured at 4
		// -- enough data for the whole clip -- with `totalVideoFrames` still 0, so it skipped the
		// seek, nothing ever decoded, and the thumbhash showed through the poster's absence.
		this.#primed = true;
		const at = this.#restored ?? 0;
		// Spent here rather than at `start`: the position has been applied, and applying it twice
		// would seek a clip the reader has just pressed play on.
		this.#restored = undefined;
		this.seekTo(at > 0 ? at : NUDGE);
	}

	/**
	 * Seek, waiting for metadata if there is not yet a timeline to seek within.
	 *
	 * Assigning `currentTime` before metadata sets a default start position instead of seeking,
	 * which lands in the right place but never fires `seeked` -- and `seeked` is what tells
	 * `video.svelte` a frame has been put up.
	 */
	seekTo(at: number): void {
		const element = this.#video();
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
	start(play: () => void): void {
		const at = this.#restored;
		this.#restored = undefined;
		if (at !== undefined) this.seekTo(at);
		play();
	}

	/**
	 * Record where the clip has got to, or forget it.
	 *
	 * The picture goes with the number, and that is the point of taking one at all: a reload that
	 * puts the clip back at fourteen seconds and blurs the *first* frame behind it while it
	 * decodes is showing the wrong place, and the blurred ground is the one thing on screen for
	 * that moment.
	 */
	#keep = (): void => {
		const video = this.#video();
		const clip = this.#clip();
		if (!video || !clip) return;
		this.#kept = performance.now();
		keepPosition(sessionStorage, clip, video.currentTime, video.duration, stillOf(video));
	};

	#keepWhileRunning = (): void => {
		if (performance.now() - this.#kept < KEEP_EVERY) return;
		this.#keep();
	};

	/**
	 * The last moment a phone reliably gives anybody.
	 *
	 * `pagehide` catches a reload and a deliberate close, and on a mobile browser it is not
	 * guaranteed to run before a backgrounded tab is thrown away. Going hidden is, and it is also
	 * exactly when a reader who switches away should have their place taken down.
	 */
	#keepOnHide = (): void => {
		if (document.visibilityState === 'hidden') this.#keep();
	};
}

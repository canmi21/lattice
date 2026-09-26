/**
 * The player's state, from Video.js v10's headless store rather than its skin: the store attached
 * to the clip's element and its frame, and what it says pulled into the one `View` the controls
 * draw from. See spec/architecture/video/player.md, "The chrome is built on `@videojs/core`'s
 * headless store, not its skin", for why `@videojs/core/dom`, and for the `attach` trap.
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

/** What the store says about the clip, pulled into one value the controls draw from. */
export type View = {
	paused: boolean;
	currentTime: number;
	duration: number;
	buffered: number;
	muted: boolean;
	rate: number;
	fullscreen: boolean;
	pip: boolean;
	pipAvailable: boolean;
	captions: boolean;
	hasCaptions: boolean;
};

/** The store's state and actions, by name, which the controls read and call through. */
export type Player = Record<string, unknown>;

/** Attach a store to `video` in `frame`, calling `onView` with every state it reports. */
export function attachStore(
	video: HTMLVideoElement,
	frame: HTMLElement,
	onView: (view: View) => void,
): { player: Player; release: () => void } {
	const store = createStore<PlayerTarget>()(combine(...FEATURES)) as unknown as Record<
		string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		any
	>;
	const adapter = new HTMLVideoAdapter();
	// `attach` returns nothing -- read in @videojs/media 10.0.0-rc.2, every path falls off the
	// end -- so there is no release function to hold and the teardown below has none to call.
	adapter.attach(video);
	const detach = store.attach({ media: adapter, container: frame });

	const pull = () => {
		// Tuples, not a `TimeRanges`: `MediaBufferState.buffered` is `[start, end][]`, and
		// calling `.end()` on it threw inside this very function, which stopped every field
		// below from being read at all. The last range's end is how much is on hand.
		const ranges = store.buffered as [number, number][] | undefined;
		onView({
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
		});
	};
	const stop = store.subscribe(pull);
	pull();
	return {
		player: store,
		release: () => {
			stop?.();
			detach?.();
			store.destroy?.();
		},
	};
}

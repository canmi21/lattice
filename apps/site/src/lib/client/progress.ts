/**
 * Where each clip had got to, for the length of one tab.
 *
 * A reader who reloads mid-article should find a clip where they left it, and that is the whole
 * of what this restores: **a position, never a stage and never playback**. Sound is bought with a
 * click and a reload has not been clicked, so a restored clip is a picture again until the reader
 * arrives at it -- which is the same rule a pointer leaving already follows. A reload is a longer
 * leave, not a different thing.
 *
 * It lives in the `tab` record, in `sessionStorage`, because a clip's position is a fact about
 * this sitting rather than about the reader. See `state.ts`.
 *
 * **One key holding a map, rather than one key per clip.** The flat dotted rule is about names,
 * and these keys are content ids that nothing here knows at the time of writing: this is one fact
 * whose shape is a map, not a group of facts that wanted a prefix. It also makes the collection
 * readable and clearable in one go, which a scatter of `video.at.<clip>` would not be.
 *
 * **Not capped, deliberately.** The record's rule is no eviction, and that was decided when every
 * fact was small and fixed; this is the first one whose *number* of entries is not. An entry is a
 * reference, a number and a thirty-two pixel still, which measures about a kilobyte, so a hundred
 * clips is 100KB against a quota in megabytes -- and a tab session is short. The premise changed,
 * the answer did not, and this paragraph is the difference.
 */

import { tab, type Store } from './state';

const KEY = 'video.at';

/**
 * How wide the remembered still is drawn.
 *
 * It is never looked at directly: it is stretched across the frame as a blurred ground while the
 * clip decodes, so what matters is the block of colour and not the detail. Thirty-two pixels of
 * WebP is about a kilobyte, which is the size of a thumbhash's ambition and reached without
 * carrying an encoder into the bundle.
 */
const STILL_WIDTH = 32;

/**
 * Below this there is nothing worth resuming.
 *
 * Restoring a third of a second is noise: the reader gets a clip that looks like it starts at the
 * beginning and a scrubber that says it does not.
 */
const FLOOR = 1;

/** Within this of the end the clip is finished, and a finished clip starts again. */
const ENDING = 0.5;

/** Where a clip was, and what it looked like there. */
export type Place = {
	at: number;
	/**
	 * A data URI of the frame at `at`, to blur behind the clip until it decodes that frame again.
	 *
	 * Optional because the canvas can be refused. The poster's own thumbhash is the fallback, and
	 * it is a picture of the first frame rather than of this one -- right for a clip nobody has
	 * moved, a little wrong for one that has, and much better than nothing either way.
	 */
	still?: string;
};

/**
 * Every position in the record, with anything that is not a finite number dropped.
 *
 * The check is per value rather than on the object, because `recall` can only answer whether the
 * record holds a map at all. What is inside it came from an older build, another tab's idea of
 * this key, or a reader with a console, and one `NaN` reaching `currentTime` throws.
 */
function positions(storage: Store): Record<string, Place> {
	const stored = tab.recall<Record<string, unknown>>(storage, KEY, {});
	const clean: Record<string, Place> = {};
	for (const [clip, place] of Object.entries(stored)) {
		if (typeof place !== 'object' || place === null || Array.isArray(place)) continue;
		const { at, still } = place as { at?: unknown; still?: unknown };
		if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
		clean[clip] = { at, still: typeof still === 'string' ? still : undefined };
	}
	return clean;
}

/** Where this clip had got to, or nothing if it had not got anywhere worth returning to. */
export function positionOf(storage: Store, clip: string): Place | undefined {
	return positions(storage)[clip];
}

/**
 * A picture of the frame an element is showing, small enough to keep.
 *
 * Returns nothing rather than throwing where the canvas is tainted. The clips are served with
 * `Access-Control-Allow-Origin` and the element asks for them with `crossorigin`, so in practice
 * it is clean -- but a deployment that stopped sending the header would turn every pause into an
 * exception, and the blurred ground has a perfectly good fallback in the poster's own thumbhash.
 */
export function stillOf(element: HTMLVideoElement): string | undefined {
	const width = element.videoWidth;
	const height = element.videoHeight;
	if (!width || !height) return undefined;
	try {
		const canvas = document.createElement('canvas');
		canvas.width = STILL_WIDTH;
		canvas.height = Math.max(1, Math.round((STILL_WIDTH * height) / width));
		canvas.getContext('2d')?.drawImage(element, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL('image/webp', 0.7);
	} catch {
		return undefined;
	}
}

/**
 * Record where this clip has got to, or forget it.
 *
 * Forgetting is the same call rather than a second one, because every caller that knows a
 * position also knows whether it is one worth keeping, and splitting them would put that judgement
 * at each of the call sites instead of here.
 */
export function keepPosition(
	storage: Store,
	clip: string,
	at: number,
	duration: number,
	still?: string,
): void {
	const finished = duration > 0 && at >= duration - ENDING;
	const map = positions(storage);
	if (!Number.isFinite(at) || at < FLOOR || finished) {
		if (!(clip in map)) return;
		delete map[clip];
	} else {
		if (map[clip]?.at === at && map[clip]?.still === still) return;
		map[clip] = { at, still };
	}
	tab.remember(storage, KEY, map);
}

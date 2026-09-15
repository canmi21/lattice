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
 * fact was small and fixed; this is the first one whose *number* of entries is not. A reference
 * and a number is about 45 bytes, so a thousand clips is 45KB against a quota measured in
 * megabytes -- and a tab session is short. The premise changed, the answer did not, and this
 * paragraph is the difference.
 */

import { tab, type Store } from './state';

const KEY = 'video.at';

/**
 * Below this there is nothing worth resuming.
 *
 * Restoring a third of a second is noise: the reader gets a clip that looks like it starts at the
 * beginning and a scrubber that says it does not.
 */
const FLOOR = 1;

/** Within this of the end the clip is finished, and a finished clip starts again. */
const ENDING = 0.5;

/**
 * Every position in the record, with anything that is not a finite number dropped.
 *
 * The check is per value rather than on the object, because `recall` can only answer whether the
 * record holds a map at all. What is inside it came from an older build, another tab's idea of
 * this key, or a reader with a console, and one `NaN` reaching `currentTime` throws.
 */
function positions(storage: Store): Record<string, number> {
	const stored = tab.recall<Record<string, unknown>>(storage, KEY, {});
	const clean: Record<string, number> = {};
	for (const [clip, at] of Object.entries(stored)) {
		if (typeof at === 'number' && Number.isFinite(at) && at > 0) clean[clip] = at;
	}
	return clean;
}

/** Where this clip had got to, or nothing if it had not got anywhere worth returning to. */
export function positionOf(storage: Store, clip: string): number | undefined {
	return positions(storage)[clip];
}

/**
 * Record where this clip has got to, or forget it.
 *
 * Forgetting is the same call rather than a second one, because every caller that knows a
 * position also knows whether it is one worth keeping, and splitting them would put that judgement
 * at each of the call sites instead of here.
 */
export function keepPosition(storage: Store, clip: string, at: number, duration: number): void {
	const finished = duration > 0 && at >= duration - ENDING;
	const map = positions(storage);
	if (!Number.isFinite(at) || at < FLOOR || finished) {
		if (!(clip in map)) return;
		delete map[clip];
	} else {
		if (map[clip] === at) return;
		map[clip] = at;
	}
	tab.remember(storage, KEY, map);
}

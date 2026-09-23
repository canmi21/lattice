/**
 * Where the reader had got to on each path, for the length of one tab.
 *
 * The browser restores a scroll position on a history pop and nowhere else, which is correct and
 * is not what this site's Back does -- see spec/styling/rail.md, "Back is one step up the reading
 * trail". A trail step is a forward navigation to an earlier path, so nothing native knows it is
 * a return, and the position has to be kept here. See spec/engagement.md, "A path keeps its
 * place, because Back is a link".
 *
 * Lives in the `tab` record in `sessionStorage`, as one key holding a map, for the reasons
 * `video.at` does: the keys are addresses rather than names this repository chooses, and a place
 * in a page belongs to the sitting rather than to the person.
 */

import { tab, type Store } from '@canmi/behavior/state';

const KEY = 'scroll.at';

/** Below this there is nothing to return to: a page opens at the top anyway. */
const FLOOR = 8;

/**
 * How long the restore keeps trying while the document is still growing.
 *
 * A page whose height is settled lands on the first frame and stops there; this is the ceiling
 * for one that is not, so a page that never reaches the offset gives up rather than fighting the
 * reader for the rest of the visit.
 */
const SETTLING_MS = 500;

/** Every place in the record, with anything that is not a usable offset dropped. */
function places(storage: Store): Record<string, number> {
	const stored = tab.recall<Record<string, unknown>>(storage, KEY, {});
	const clean: Record<string, number> = {};
	for (const [path, at] of Object.entries(stored)) {
		if (typeof at === 'number' && Number.isFinite(at) && at >= FLOOR) clean[path] = at;
	}
	return clean;
}

/** Where the reader had got to on this path, or nothing if they had not got anywhere. */
export function placeOf(storage: Store, path: string): number | undefined {
	return places(storage)[path];
}

/**
 * Record where this path has got to, or forget it.
 *
 * Forgetting is the same call rather than a second one, for the reason `keepPosition` gives: a
 * caller that knows an offset also knows whether it is one worth keeping.
 */
export function keepPlace(storage: Store, path: string, at: number): void {
	const map = places(storage);
	if (!Number.isFinite(at) || at < FLOOR) {
		if (!(path in map)) return;
		delete map[path];
	} else {
		if (map[path] === at) return;
		map[path] = at;
	}
	tab.remember(storage, KEY, map);
}

/**
 * Go to a remembered offset, following the page while it is still finding its height.
 *
 * A settled document lands on the first attempt and stops there; the following is for the part
 * of a page measured after mount, which is briefly shorter than it will be. **The reader wins
 * immediately** -- a scroll of their own ends it. See spec/engagement.md, "A path keeps its
 * place, because Back is a link".
 */
export function goTo(at: number): void {
	const until = performance.now() + SETTLING_MS;
	let following = true;
	const give = (): void => {
		following = false;
		removeEventListener('wheel', give);
		removeEventListener('touchstart', give);
		removeEventListener('keydown', give);
	};
	addEventListener('wheel', give, { passive: true });
	addEventListener('touchstart', give, { passive: true });
	addEventListener('keydown', give);

	const step = (): void => {
		if (!following) return;
		const reachable = document.documentElement.scrollHeight - window.innerHeight;
		window.scrollTo({ top: Math.min(at, Math.max(0, reachable)), behavior: 'instant' });
		if (reachable >= at || performance.now() > until) {
			give();
			return;
		}
		requestAnimationFrame(step);
	};
	step();
}

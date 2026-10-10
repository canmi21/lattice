/**
 * Where the reader had got to in each page's main area, for the length of one tab, and getting
 * them back there as near as the page still allows: the offset where the page is as it was, else
 * the section they were in and how far into it, else the top. See spec/console/state.md, "A place
 * comes back as near as the page still allows".
 */
import type { Store } from '@canmi/kit/behavior/state';
import { tab } from '../state.ts';

const KEY = 'scroll.at';

/** Below this there is nothing to return to: a page opens at the top anyway. */
const FLOOR = 8;

/** How long a return follows a page still drawing its data, before giving up on it. */
const SETTLING_MS = 1_500;

/** A place: the offset, how tall the page was, and the section it was in by name and depth. */
export interface Place {
	top: number;
	height: number;
	section?: { name: string; within: number };
}

/** A section of the main area, named by its heading's words, else by its order. */
function sections(scroller: HTMLElement): { name: string; top: number }[] {
	const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
	return [...scroller.querySelectorAll('section')].map((one, index) => ({
		name: one.querySelector('h1, h2, h3')?.textContent?.trim() || `#${index}`,
		top: one.getBoundingClientRect().top - base,
	}));
}

function places(storage: Store): Record<string, Place> {
	const stored = tab.recall<Record<string, unknown>>(storage, KEY, {});
	const clean: Record<string, Place> = {};
	for (const [path, place] of Object.entries(stored)) {
		const { top, height, section } = (place ?? {}) as Partial<Place>;
		if (typeof top !== 'number' || !Number.isFinite(top) || typeof height !== 'number') continue;
		const named =
			typeof section?.name === 'string' && typeof section.within === 'number' ? section : undefined;
		clean[path] = { top, height, section: named };
	}
	return clean;
}

/** Where `scroller` stands now, as a place worth keeping or nothing. */
export function placeIn(scroller: HTMLElement): Place | undefined {
	const top = scroller.scrollTop;
	if (top < FLOOR) return undefined;
	const at = sections(scroller).findLast((one) => one.top <= top + 1);
	return {
		top,
		height: scroller.scrollHeight,
		section: at && { name: at.name, within: top - at.top },
	};
}

/** Keeps `place` as this path's, or forgets the path's where there is none. */
export function keepPlace(storage: Store, path: string, place: Place | undefined): void {
	const map = places(storage);
	if (!place) {
		if (!(path in map)) return;
		delete map[path];
	} else map[path] = place;
	tab.remember(storage, KEY, map);
}

export function placeOf(storage: Store, path: string): Place | undefined {
	return places(storage)[path];
}

/** Where a place lands in the page as it stands now: the offset, the section, or the top. */
export function landing(scroller: HTMLElement, place: Place): number {
	if (Math.abs(scroller.scrollHeight - place.height) < 1) return place.top;
	const section =
		place.section && sections(scroller).find((one) => one.name === place.section?.name);
	if (section && place.section) return section.top + place.section.within;
	return 0;
}

/**
 * Takes `scroller` to `place`, following the page while it is still finding its height; the
 * reader's own scroll, wheel, touch or key, ends the following at once.
 */
export function goTo(scroller: HTMLElement, place: Place | undefined): void {
	if (!place) {
		scroller.scrollTo({ top: 0 });
		return;
	}
	const until = performance.now() + SETTLING_MS;
	let following = true;
	const give = () => {
		following = false;
		for (const kind of ['wheel', 'touchstart', 'keydown'] as const) {
			scroller.removeEventListener(kind, give);
		}
	};
	for (const kind of ['wheel', 'touchstart', 'keydown'] as const) {
		scroller.addEventListener(kind, give, { passive: true });
	}
	const step = () => {
		if (!following) return;
		scroller.scrollTo({ top: landing(scroller, place) });
		if (performance.now() < until) requestAnimationFrame(step);
		else give();
	};
	step();
}

/**
 * The tab last open on each page, for the length of one browser tab: a place, not a preference,
 * so it is the sitting's. See spec/console/state.md, "Kept, and where".
 */
import type { Store } from '@canmi/kit/behavior/state';
import { tab } from '../state.ts';

const KEY = 'tab.at';

function opened(storage: Store): Record<string, unknown> {
	return tab.recall<Record<string, unknown>>(storage, KEY, {});
}

/** The tab last open on `path` where it is one of `allowed`, else `fallback`. */
export function openedOn<T extends string>(
	storage: Store,
	path: string,
	allowed: readonly T[],
	fallback: T,
): T {
	const held = opened(storage)[path];
	return allowed.find((one) => one === held) ?? fallback;
}

export function keepOpened(storage: Store, path: string, key: string): void {
	const map = opened(storage);
	if (map[path] === key) return;
	tab.remember(storage, KEY, { ...map, [path]: key });
}

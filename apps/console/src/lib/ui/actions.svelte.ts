/**
 * The top bar's right: what a page offers to do, put there by the page and drawn by the bar. A
 * page calls `pageActions` while it initializes; the slot empties as it goes. Effects run in the
 * browser alone, so the server draws the slot empty and nothing outlives a request.
 */
import { getContext, setContext, type Snippet } from 'svelte';

export class Actions {
	current: Snippet | undefined = $state();
}

const KEY = Symbol('actions');

export function provideActions(): Actions {
	return setContext(KEY, new Actions());
}

/** Puts `actions` on the top bar's right while the calling page is mounted. */
export function pageActions(actions: Snippet): void {
	const slot = getContext<Actions | undefined>(KEY);
	$effect.pre(() => {
		if (!slot) return;
		slot.current = actions;
		return () => {
			// The next page may have put its own already.
			if (slot.current === actions) slot.current = undefined;
		};
	});
}

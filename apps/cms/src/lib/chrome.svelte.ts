/**
 * What a page puts over the pane rather than in it: a toolbar floating at its foot, and a drawer
 * at its right.
 *
 * Both have to sit still while the pane's text scrolls under them, so they are drawn by the layout,
 * outside the element that scrolls, and a page only hands over what goes in them. A page hands them
 * over while it is being set up -- before the layout reaches the place it draws them -- so the
 * server renders them with everything else. See spec/architecture/local.md.
 */
import { getContext, onDestroy, setContext, type Snippet } from 'svelte';

export class Chrome {
	toolbar = $state<Snippet | undefined>(undefined);
	drawer = $state<Snippet | undefined>(undefined);
}

/**
 * How the window's edges bring out what is folded against them -- the sidebar at the left, a
 * page's drawer at the right: within 8px of the edge, and back once the pointer is 24px clear of
 * the panel's inner side. One pair for both, so the two edges answer the same gesture the same way.
 */
export const EDGE_MARGINS = { within: 8, release: 24 };

const KEY = Symbol('chrome');

/** Called by the layout that draws them. */
export function provideChrome(): Chrome {
	return setContext(KEY, new Chrome());
}

/** Called by a page, with what it puts there; taken down again when the page goes. */
export function useChrome(parts: { toolbar?: Snippet; drawer?: Snippet }): Chrome {
	const chrome = getContext<Chrome>(KEY);
	chrome.toolbar = parts.toolbar;
	chrome.drawer = parts.drawer;
	onDestroy(() => {
		if (chrome.toolbar === parts.toolbar) chrome.toolbar = undefined;
		if (chrome.drawer === parts.drawer) chrome.drawer = undefined;
	});
	return chrome;
}

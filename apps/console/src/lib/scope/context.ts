/**
 * The view the page is read in, set once by the layout from the address and read by every
 * component that links, so a link keeps the view. See spec/architecture/console.md.
 */
import { getContext, setContext } from 'svelte';
import { type View, appHref, nodeHref, within } from './scope.ts';

const KEY = Symbol('view');

/** `read` is called on each use, so one layout serves every view it is navigated through. */
export function setView(read: () => View): void {
	setContext(KEY, read);
}

/** The view being read: All where none is set, as in a test. */
export function currentView(): () => View {
	return getContext<(() => View) | undefined>(KEY) ?? (() => 'all');
}

/** Link makers for the view being read: `to('/deployments/7')`, `node('tyo')`, `app('web')`. */
export function scoped() {
	const read = currentView();
	return {
		to: (path: string) => within(read(), path),
		node: (code: string) => nodeHref(read(), code),
		app: (name: string) => appHref(read(), name),
	};
}

/** Exported for a test to render a component as though the layout had set `view`. */
export function viewedAs(view: View): Map<symbol, () => View> {
	return new Map([[KEY, () => view]]);
}

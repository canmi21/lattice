/**
 * A value only a browser can work out, computed before the page that needs it is drawn.
 *
 * The rule and the reasoning are spec/styling/first-paint.md, "A page declares what only a
 * browser can work out". This file is the mechanism: a `load` calls `measured`, a component takes
 * the answer as a prop, and the one that arrives `undefined` is the one that has to settle.
 */

import { browser } from '$app/environment';
import { arriving } from './arrival';

/**
 * How long a measurement may wait for the fonts it is about to measure in.
 *
 * A navigation does not render until its `load` resolves, so this is the reader watching the page
 * they left. On a client navigation the fonts are already loaded and the wait is one microtask;
 * what this bounds is the case where one never arrives, where a slightly wrong width is a far
 * better answer than a page that does not come.
 */
const FONTS_MS = 400;

/**
 * Compute on a client navigation, answer `undefined` anywhere else.
 *
 * **The absence is the signal**: a component given nothing draws its default and settles, one
 * given a value draws the value. Undefined during hydration as well as on the server, because
 * SvelteKit runs a universal `load` again as it hydrates -- without that the measurement lands
 * one frame after the default and the first paint jumps instead of settling. See
 * spec/styling/first-paint.md, "A page declares what only a browser can work out".
 */
export async function measured<T>(compute: () => T): Promise<T | undefined> {
	if (!browser || arriving()) return undefined;
	await fontsSettled();
	return compute();
}

/**
 * Text measured in a font that has not loaded is measured in a different font.
 *
 * `document.fonts.ready` is the wait, raced rather than awaited: see `FONTS_MS`.
 */
async function fontsSettled(): Promise<void> {
	if (!document.fonts) return;
	await Promise.race([
		document.fonts.ready,
		new Promise<void>((resolve) => setTimeout(resolve, FONTS_MS)),
	]);
}

/** The shorthand `measureText` wants: weight, size and family, in that order. */
function shorthand(style: CSSStyleDeclaration): string {
	return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

const fonts = new Map<string, string>();

/**
 * The font a class resolves to, read without the element that will wear it.
 *
 * A measurement taken during a navigation has no element on the page it is for; that page does
 * not exist yet. The stylesheet does, and it is the site's rather than any page's, so a probe
 * wearing the class in the document already open resolves to the same font the real element
 * will. Memoised, because that is a fact about the stylesheet and cannot have changed.
 */
export function fontOfClass(className: string): string {
	const held = fonts.get(className);
	if (held !== undefined) return held;

	const probe = document.createElement('span');
	probe.className = className;
	// Out of flow and out of the way: it is read, never seen, and must not reflow what is on
	// screen while the reader is looking at it.
	probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:-9999px';
	document.body.appendChild(probe);
	const font = shorthand(getComputedStyle(probe));
	probe.remove();

	fonts.set(className, font);
	return font;
}

/**
 * A value only a browser can work out, computed before the page that needs it is drawn.
 *
 * The rule and the reasoning are spec/styling/first-paint.md, "A page declares what only a
 * browser can work out". This file is the mechanism: a `load` calls `measured`, a component takes
 * the answer as a prop, and the one that arrives `undefined` is the one that has to settle.
 */

import { BROWSER as browser } from 'esm-env';
import { arriving } from '@canmi/behavior/arrival';
import { tab, type Store } from '@canmi/behavior/state';

/**
 * How long a measurement may wait for the fonts it is about to measure in.
 *
 * A navigation does not render until its `load` resolves, so this is the reader watching the page
 * they left. On a client navigation the fonts are already loaded and the wait is one microtask;
 * what this bounds is the case where one never arrives, where a slightly wrong width is a far
 * better answer than a page that does not come.
 */
const FONTS_MS = 400;

/** Where a measurement is kept for the rest of the sitting. One key, a map inside it. */
const KEY = 'measured';

/** What is stored: the answer, and what it was an answer about. */
type Held = { of: string; value: unknown };

function held(storage: Store): Record<string, Held> {
	const stored = tab.recall<Record<string, unknown>>(storage, KEY, {});
	const clean: Record<string, Held> = {};
	for (const [name, entry] of Object.entries(stored)) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
		const { of, value } = entry as { of?: unknown; value?: unknown };
		if (typeof of === 'string' && value !== undefined) clean[name] = { of, value };
	}
	return clean;
}

/**
 * Answer the measurement, and settle only the first time in a sitting that nobody has one.
 *
 * **The absence is the signal**: a component given nothing draws its default and settles, one
 * given a value draws the value. A server has nothing to measure with, a navigation measures
 * before it renders, and an arrival is answered from what this tab already worked out.
 *
 * `of` is what the answer is about, so a shape measured from one list of headings is never drawn
 * for another. See spec/styling/first-paint.md, "A measurement is a fact about this sitting".
 */
export async function measured<T>(
	name: string,
	of: string,
	compute: () => T,
): Promise<T | undefined> {
	if (!browser) return undefined;

	const stored = held(sessionStorage)[name];
	if (stored?.of === of) return stored.value as T;

	if (arriving()) {
		// Measured anyway, so the next page in this sitting is drawn rather than settled -- and
		// answered `undefined`, because the arrival is where the animation belongs.
		void fontsSettled().then(() => keep(name, of, compute()));
		return undefined;
	}

	await fontsSettled();
	const value = compute();
	keep(name, of, value);
	return value;
}

/** Write one answer into the sitting's record. A failure is silence: it is only ever a shortcut. */
function keep(name: string, of: string, value: unknown): void {
	try {
		tab.remember(sessionStorage, KEY, { ...held(sessionStorage), [name]: { of, value } });
	} catch {
		// Private browsing, or storage the reader turned off. The measurement still happened.
	}
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
	return fontOfProbe([['span', className]]);
}

/**
 * The same, for a font an element only has because of where it sits.
 *
 * An article heading is `600` because of its own class and `15px` because of the article body
 * around it -- two components, and neither alone resolves to what the heading actually is. The
 * chain is outermost first, and the font read is the last element's.
 */
export function fontOfProbe(chain: readonly (readonly [string, string])[]): string {
	const key = chain.map(([tag, className]) => `${tag}.${className}`).join('>');
	const held = fonts.get(key);
	if (held !== undefined) return held;

	let outer: HTMLElement | undefined;
	let inner: HTMLElement | undefined;
	for (const [tag, className] of chain) {
		const element = document.createElement(tag);
		element.className = className;
		if (inner) inner.appendChild(element);
		else outer = element;
		inner = element;
	}
	if (!outer || !inner) return shorthand(getComputedStyle(document.body));

	// Out of flow and out of the way: it is read, never seen, and must not reflow what is on
	// screen while the reader is looking at it.
	outer.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:-9999px';
	document.body.appendChild(outer);
	const font = shorthand(getComputedStyle(inner));
	outer.remove();

	fonts.set(key, font);
	return font;
}

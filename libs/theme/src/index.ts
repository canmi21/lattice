import { inlineScriptString } from './inline-script';

const SYSTEM_DARK_QUERY = '(prefers-color-scheme:dark)';

export type Theme = 'light' | 'dark';

/**
 * How the theme cookie is written, wherever it is written.
 *
 * The script below settles the first visit and a control settles every one after it, so both
 * write this cookie -- and a control that wrote a shorter life, or a different path, would let
 * the two disagree about a preference the reader only set once. One string, interpolated into
 * the script and returned to the control.
 */
const COOKIE_ATTRIBUTES = ';path=/;max-age=31536000;SameSite=Lax';

export const themeScript = `(function(){var mm=document.cookie.match(/\\btheme=(light|dark)\\b/);var pm=document.cookie.match(/\\bpalette=(nord|contrast)\\b/);var m=mm?mm[1]:window.matchMedia(${inlineScriptString(SYSTEM_DARK_QUERY)}).matches?"dark":"light";var h=document.documentElement;if(m==="dark")h.classList.add("dark");if(pm)h.classList.add(pm[1]);if(!mm)document.cookie="theme="+m+${inlineScriptString(COOKIE_ATTRIBUTES)}})()`;

/** The cookie a control writes when the reader picks a theme. */
export function themeCookie(theme: Theme): string {
	return `theme=${theme}${COOKIE_ATTRIBUTES}`;
}

/**
 * Which theme is on screen right now, read off the document rather than off the cookie.
 *
 * The class is what the page is actually painted from, and the script above sets it before the
 * first frame whether or not a cookie existed. Reading the cookie instead would answer nothing
 * on a first visit, which is exactly when the two can differ.
 */
export function currentTheme(root: HTMLElement = document.documentElement): Theme {
	return root.classList.contains('dark') ? 'dark' : 'light';
}

/** Paint a theme. Toggling the class is the whole of it; every colour is a token beneath it. */
/**
 * Move the class with every transition in the document switched off, then switch them back on.
 *
 * A theme is one class and the whole page repaints from it in a single frame -- nothing eases
 * `--color-page`. But anything that eases a colour for its *own* reasons eases this one too: a
 * card that fades its border on hover fades it from the light border to the dark one as well, so
 * the page arrives black while its cards are still halfway, sweeping through greys that belong to
 * neither theme. Measured on an article's link cards: 150ms of intermediate value behind a page
 * that had already finished.
 *
 * The hover fade is right and is not what changes. What changes is that a theme is not a state
 * anything transitions *to* -- it is which set of values was true all along -- so the one frame it
 * moves in is the one frame nothing may animate.
 *
 * **The reflow is the whole trick.** Without reading a layout property between the two writes, the
 * browser coalesces adding the sheet, toggling the class and removing the sheet into one style
 * recalculation, sees only the start and end, and transitions anyway.
 */
function withoutTransitions(change: () => void, root: HTMLElement): void {
	// A root outside a document has nothing painting from it, so there is nothing to suppress and
	// the sheet would have nowhere to go. Make the change and return.
	const document_ = root.ownerDocument as Document | undefined;
	if (!document_?.head) {
		change();
		return;
	}
	const suppress = document_.createElement('style');
	suppress.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
	document_.head.append(suppress);
	change();
	// Read, and do not remove the read: it is what forces the new values to be committed under
	// the rule above rather than after it.
	void root.offsetHeight;
	suppress.remove();
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
	withoutTransitions(() => root.classList.toggle('dark', theme === 'dark'), root);
}

export function followSystemTheme(
	root: HTMLElement = document.documentElement,
	media: MediaQueryList = window.matchMedia(SYSTEM_DARK_QUERY),
): () => void {
	// The same class, so the same one frame in which nothing may animate.
	const apply = () =>
		withoutTransitions(() => root.classList.toggle('dark', media.matches), root);
	apply();
	media.addEventListener('change', apply);
	return () => media.removeEventListener('change', apply);
}

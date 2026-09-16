/**
 * The brief selection-coloured light a note jump lands with, in either direction.
 *
 * See spec/styling.md, "The walk back from a note lights the words it lands on", for why arrival
 * needs its own signal (the URL never carries the move) and why the light is a painted layer
 * rather than a background. One box per rendered line fragment, read off `getClientRects()` at
 * arrival, in document coordinates so the boxes stay glued to the words under further scrolling.
 * One flash at a time, module-wide: the two directions share the reader's attention, so a new
 * jump takes the light with it.
 */

/** As long as the fade, plus a beat: the overlay must outlive what it plays. */
const FLASH_MS = 1900;
/** Give up waiting for the scroll and light up anyway: arrival detection is best effort. */
const ARRIVAL_MS = 3000;
/** The classed target still drives the marker-number tint in prose; see article.svelte. */
const CLASS = 'note-return';

/**
 * How a light that wraps closes its corners.
 *
 * `each` rounds every fragment into a finished box: the prose words, where every fragment is
 * wholly "the marked words". `ends` rounds only where the sentence starts and stops, leaving
 * square edges at the breaks: the note's line, one sentence whose break says it continues --
 * the same way a real drag-selection breaks, and this is its ink.
 */
export type FlashCorners = 'each' | 'ends';

let flashed: HTMLElement | undefined;
let overlay: HTMLDivElement | undefined;
let flashTimer: ReturnType<typeof setTimeout> | undefined;

function clear() {
	if (flashTimer !== undefined) clearTimeout(flashTimer);
	flashTimer = undefined;
	flashed?.classList.remove(CLASS);
	flashed = undefined;
	overlay?.remove();
	overlay = undefined;
}

function paint(target: HTMLElement, corners: FlashCorners): HTMLDivElement {
	const layer = document.createElement('div');
	// Absolute at the document root, so page coordinates are its coordinates. Inert to the
	// pointer, and above every block's own stacking (code blocks top out at 10) while staying
	// under the modal layer at 50 -- a landing light must never sit on a dialog.
	layer.style.cssText = 'position:absolute;left:0;top:0;z-index:30;pointer-events:none;';
	const em = Number.parseFloat(getComputedStyle(target).fontSize);
	const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
	// The tailoring the background version wore: snug over the glyphs, rounded at the corners
	// the semantics leave closed.
	const padX = 0.2 * em;
	const padY = 0.08 * em;
	const radius = 0.25 * rem;
	const rects = [...target.getClientRects()];
	for (const [index, rect] of rects.entries()) {
		const first = index === 0;
		const last = index === rects.length - 1;
		const startPad = corners === 'each' || first ? padX : 0;
		const endPad = corners === 'each' || last ? padX : 0;
		const rounded =
			corners === 'each'
				? `${radius}px`
				: `${first ? radius : 0}px ${last ? radius : 0}px ${last ? radius : 0}px ${first ? radius : 0}px`;
		const box = document.createElement('div');
		box.style.cssText =
			`position:absolute;background:var(--color-selection);border-radius:${rounded};` +
			`left:${rect.left + window.scrollX - startPad}px;top:${rect.top + window.scrollY - padY}px;` +
			`width:${rect.width + startPad + endPad}px;height:${rect.height + 2 * padY}px;`;
		layer.appendChild(box);
	}
	document.body.appendChild(layer);
	return layer;
}

/**
 * Light `target` once the scroll that is carrying it settles.
 *
 * On arrival, not on departure -- a long article's smooth scroll outlasts the fade otherwise.
 * The duration is internal and per-engine and Safari has no `scrollend`, so arrival is read off
 * geometry instead: in the viewport and unchanged for a frame, capped so an interrupted scroll
 * still ends the wait. The timer owns removal, since reduced motion fires no finish event.
 */
export function flashOnArrival(target: HTMLElement, corners: FlashCorners): void {
	clear();
	flashed = target;
	const started = performance.now();
	let restingTop: number | undefined;
	const settled = () => {
		const { top, bottom } = target.getBoundingClientRect();
		const inView = top >= 0 && bottom <= window.innerHeight;
		const still = restingTop !== undefined && Math.abs(top - restingTop) < 1;
		restingTop = top;
		return inView && still;
	};
	const waitThenFlash = () => {
		if (flashed !== target) return;
		if (!settled() && performance.now() - started < ARRIVAL_MS) {
			requestAnimationFrame(waitThenFlash);
			return;
		}
		target.classList.add(CLASS);
		overlay = paint(target, corners);
		// Whole on the first frame -- the instant of arrival is the message -- held, then
		// letting go slowly.
		if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			overlay.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], {
				duration: FLASH_MS - 100,
				easing: 'ease-out',
				fill: 'forwards',
			});
		}
		flashTimer = setTimeout(clear, FLASH_MS);
	};
	requestAnimationFrame(waitThenFlash);
}

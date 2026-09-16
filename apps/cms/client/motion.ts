/**
 * The sliding indicator under a row of tabs.
 *
 * One element is moved and resized between the tabs rather than each tab drawing its own
 * underline, because two underlines cross-fading is a change of state and one bar travelling is
 * a change of place -- and a tab strip is about place. It also means the rail underneath can be
 * invisible: the moving bar is what says where you are, so nothing has to draw the track it
 * rides on.
 *
 * Shared here rather than written into the library page, because every page that grows a tab
 * strip wants the same gesture, and a second copy of the spring is two numbers to keep in step.
 * The spring itself lives in `@canmi/motion` with the site's disclosures, which is the pair that
 * put it there. See spec/architecture/cms.md.
 */

import {
	NEGLIGIBLE_PIXELS,
	contentMotion,
	pressMotion,
	prefersReducedMotion,
	travelMotion,
} from '@canmi/motion';
import { remFromMeasuredPixels } from '@canmi/units';
import { animate } from 'motion';

type Control = { stop: () => void };

const running = new WeakMap<HTMLElement, Control>();
// The indicator runs two at once, one per edge.
const travelling = new WeakMap<HTMLElement, Control[]>();

/**
 * Put `indicator` under `active`, travelling from wherever it currently is.
 *
 * Driven by its centre, not its left edge, on its own curve from the width's; the first
 * placement is silent, since a bar sweeping in on load reads as loading rather than as a
 * position. See spec/architecture/cms.md, "It travels on its own gesture, not the one panels
 * open with" for why.
 */
export function slideIndicator(indicator: HTMLElement, active: HTMLElement): void {
	if (indicator.parentElement === null) return;

	const toWidth = active.offsetWidth;
	// A hidden page has no geometry, and the CMS opens on the Overview -- so the library's first
	// draw happens while its tabs measure zero. Placing the bar there would pin it to nothing and,
	// worse, mark it placed, so the real placement would then animate in from the left edge.
	if (toWidth === 0) return;
	const toCentre = active.offsetLeft + toWidth / 2;

	for (const control of travelling.get(indicator) ?? []) control.stop();
	travelling.delete(indicator);

	const paint = (centre: number, width: number) => {
		indicator.style.transform = `translateX(${remFromMeasuredPixels(centre - width / 2)})`;
		indicator.style.width = remFromMeasuredPixels(Math.max(0, width));
	};

	if (indicator.dataset.placed === undefined || prefersReducedMotion()) {
		indicator.dataset.placed = '';
		paint(toCentre, toWidth);
		return;
	}

	const fromWidth = indicator.offsetWidth;
	const fromCentre = indicator.offsetLeft + getTranslateX(indicator) + fromWidth / 2;
	if (
		Math.abs(fromCentre - toCentre) < NEGLIGIBLE_PIXELS &&
		Math.abs(fromWidth - toWidth) < NEGLIGIBLE_PIXELS
	) {
		paint(toCentre, toWidth);
		return;
	}

	// The distance the bar covers is its centre's, which is what a person follows.
	const { duration, centre, width } = travelMotion(toCentre - fromCentre);
	let liveCentre = fromCentre;
	let liveWidth = fromWidth;

	travelling.set(indicator, [
		animate(fromCentre, toCentre, {
			duration,
			ease: centre as never,
			onUpdate: (value: number) => {
				liveCentre = value;
				paint(liveCentre, liveWidth);
			},
		}),
		animate(fromWidth, toWidth, {
			duration,
			ease: width as never,
			onUpdate: (value: number) => {
				liveWidth = value;
				paint(liveCentre, liveWidth);
			},
		}),
	]);
}

function getTranslateX(element: HTMLElement): number {
	const transform = getComputedStyle(element).transform;
	if (transform === 'none') return 0;
	const matrix = new DOMMatrixReadOnly(transform);
	return matrix.m41;
}

/**
 * Open or close `panel`, animating between two measured heights.
 *
 * `height: auto` cannot be animated, so the natural height is measured briefly, then handed back
 * to `auto` once arrived -- pinning to a number would stop it following its own content on
 * resize. Same spring as the site's disclosures.
 *
 * Interruptible: a running animation stops before the next starts and departs from where the old
 * one had reached, so a fast double click reverses it rather than queueing.
 */
export function animateHeight(panel: HTMLElement, expanded: boolean): void {
	running.get(panel)?.stop();
	running.delete(panel);

	const from = panel.getBoundingClientRect().height;
	panel.style.height = 'auto';
	const to = expanded ? panel.getBoundingClientRect().height : 0;

	const settle = () => {
		panel.style.height = expanded ? 'auto' : '0rem';
		running.delete(panel);
	};

	const budget = visibleBudget(panel);
	if (prefersReducedMotion() || Math.abs(from - to) < NEGLIGIBLE_PIXELS || budget === 0) {
		settle();
		return;
	}

	// Only the part that can be seen is played. A panel taller than the window spends most of a
	// move below the fold, where nothing on screen changes: measured folding a 3474px list in a
	// 536px window, 300ms of a 500ms move passed before anything in view shifted at all, and the
	// press read as ignored for that whole time. The rest is taken instantly, where nobody is
	// looking, and what is animated is what somebody watches.
	const travel = Math.min(Math.abs(to - from), budget);
	const folding = to < from;
	const departure = folding ? to + travel : from;
	const arrival = folding ? to : from + travel;

	panel.style.height = remFromMeasuredPixels(departure);
	const control: Control = animate(departure, arrival, {
		...pressMotion(travel),
		onUpdate: (height: number) => {
			panel.style.height = remFromMeasuredPixels(Math.max(0, height));
		},
		onComplete: settle,
	});
	running.set(panel, control);
}

/**
 * How much of a panel's growth or fold can actually be watched.
 *
 * From its top edge to the bottom of whatever scrolls it, capped at that scroller's own height --
 * a panel whose top is above the fold can still only show a window's worth. Zero when the panel is
 * entirely below the fold, where the honest animation is none.
 */
function visibleBudget(panel: HTMLElement): number {
	const scroller = panel.closest('.page-content');
	if (scroller === null) return Number.POSITIVE_INFINITY;
	const view = scroller.getBoundingClientRect();
	const top = panel.getBoundingClientRect().top;
	return Math.max(0, Math.min(view.bottom - top, view.height));
}

/**
 * Let a control resize itself, rather than jump, when what it says changes.
 *
 * The width is measured before and after `change` runs, so the caller only has to describe the
 * new content: pinned to where it was, driven to where it is going, then released back to `auto`
 * so it keeps following its own text at a different zoom or font size. Lifted from the site's
 * support actions, which do the same measure, pin, travel, release.
 */
export function animateWidth(element: HTMLElement, change: () => void): void {
	const from = element.getBoundingClientRect().width;
	element.style.width = '';
	change();
	const to = element.getBoundingClientRect().width;

	running.get(element)?.stop();
	running.delete(element);

	if (prefersReducedMotion() || Math.abs(to - from) < NEGLIGIBLE_PIXELS) return;

	element.style.width = remFromMeasuredPixels(from);
	const control: Control = animate(from, to, {
		...contentMotion(),
		onUpdate: (width: number) => {
			element.style.width = remFromMeasuredPixels(Math.max(0, width));
		},
		onComplete: () => {
			// Only the animation still in charge may release the width: an interrupted one settling
			// late would hand the element back to `auto` in the middle of the move that replaced it.
			if (running.get(element) !== control) return;
			running.delete(element);
			element.style.width = '';
		},
	});
	running.set(element, control);
}

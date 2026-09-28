/**
 * How the panel moves, on the site's timing (`@canmi/motion`) and played by the browser, as the
 * editor plays it: a page arriving, and the sidebar's marker crossing to the page it now names.
 * Under reduced motion nothing moves, and everything is where it would have ended.
 */
import { pressMotion, prefersReducedMotion, travelMotion } from '@canmi/motion';

function curve(points: readonly number[]): string {
	return `cubic-bezier(${points.join(', ')})`;
}

/** How far a page rises as it arrives, in pixels: enough to read as coming, not as sliding. */
const RISE = 6;

/** A page, or a card on it, coming in: from a little below and transparent, to where it rests. */
export function arrive(node: HTMLElement, delay = 0): void {
	if (prefersReducedMotion()) return;
	const timing = pressMotion(RISE * 12);
	node.animate(
		[
			{ opacity: 0, transform: `translateY(${RISE}px)` },
			{ opacity: 1, transform: 'translateY(0)' },
		],
		{ duration: timing.duration * 1000, delay, easing: curve(timing.ease), fill: 'backwards' },
	);
}

/** Where a marker stands along its axis: where it starts and how long it is, in pixels. */
export interface Place {
	start: number;
	size: number;
}

/**
 * Carry a marker from one place to another, down a column or along a row. The position and the
 * length run on their own curves over one duration, as a tab indicator does in the editor; the
 * element is left at `to`, set inline.
 */
export function travel(
	marker: HTMLElement,
	from: Place | undefined,
	to: Place,
	axis: 'x' | 'y',
): void {
	const shift = (at: number) => `translate${axis.toUpperCase()}(${at}px)`;
	const length = axis === 'x' ? 'width' : 'height';
	marker.style.transform = shift(to.start);
	marker.style[length] = `${to.size}px`;
	if (!from || prefersReducedMotion() || (from.start === to.start && from.size === to.size)) return;
	const timing = travelMotion(to.start - from.start);
	const duration = timing.duration * 1000;
	marker.animate([{ transform: shift(from.start) }, { transform: shift(to.start) }], {
		duration,
		easing: curve(timing.centre),
	});
	marker.animate([{ [length]: `${from.size}px` }, { [length]: `${to.size}px` }], {
		duration,
		easing: curve(timing.width),
	});
}

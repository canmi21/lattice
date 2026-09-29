/**
 * How the board moves, on the site's timing (`@canmi/motion`) and played by `motion`: a line whose
 * state changed settling into place, and a segment arriving or turning. Nothing moves on the first
 * screen -- only what changes after the browser took over -- and under reduced motion nothing
 * moves at all; every element is already where it ends.
 */
import { pressMotion, prefersReducedMotion } from '@canmi/motion';
import { animate } from 'motion';

/** How far a changed line rises as it settles, in pixels: enough to be seen, not to be read. */
const RISE = 4;

function still(): boolean {
	return prefersReducedMotion();
}

/**
 * A line that says a state: when the state it is given changes, the new words rise into place.
 * The first value is the server's and plays nothing.
 */
export function settle<Value>(node: HTMLElement, value: Value) {
	let held = value;
	return {
		update(next: Value) {
			if (next === held) return;
			held = next;
			if (still()) return;
			const { duration, ease } = pressMotion(RISE * 12);
			animate(node, { opacity: [0, 1], y: [RISE, 0] }, { duration, ease: [...ease] });
		},
	};
}

/**
 * One segment of an uptime bar: it grows in when it arrives after the first screen -- the next
 * half-hour opening -- and swells once when its state changes, so a new failure is noticed. The
 * colour itself eases by the component's transition.
 */
export function segment<Value>(node: HTMLElement, options: { state: Value; arrived: boolean }) {
	let held = options.state;
	const { duration, ease } = pressMotion(24);
	if (options.arrived && !still()) {
		animate(node, { opacity: [0, 1], scaleY: [0.3, 1] }, { duration, ease: [...ease] });
	}
	return {
		update(next: { state: Value; arrived: boolean }) {
			if (next.state === held) return;
			held = next.state;
			if (still()) return;
			animate(node, { scaleY: [0.6, 1] }, { duration, ease: [...ease] });
		},
	};
}

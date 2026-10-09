/**
 * How the console moves: GSAP, and nothing at all for a reader who asks for reduced motion. Every
 * animation in the shell starts here, so that one test decides it. See spec/console/design.md,
 * "Motion is GSAP".
 */
import { gsap } from 'gsap';

/** Whether this reader has asked for less motion; true on the server, which draws no motion. */
export function stilled(): boolean {
	return (
		typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/**
 * A surface that has just opened -- a menu, a popover -- arriving from a step above where it
 * rests. An attachment, so it runs as the element mounts.
 */
export function arrive(node: HTMLElement): void {
	if (stilled()) return;
	gsap.fromTo(
		node,
		{ autoAlpha: 0, y: -4 },
		{ autoAlpha: 1, y: 0, duration: 0.16, ease: 'power2.out', clearProps: 'transform' },
	);
}

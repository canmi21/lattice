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

/** How far a level of the sidebar travels as it gives way, in pixels. */
const STEP = 24;

/**
 * The sidebar moving between levels: `ghost`, a copy of the level left, slides off toward the side
 * it is left by and is removed, and `panel`, the level now drawn, arrives from the other. `way` is
 * 1 going deeper, so the old goes left and the new comes from the right, and -1 coming back up.
 */
export function pass(ghost: HTMLElement, panel: HTMLElement, way: 1 | -1): void {
	if (stilled()) {
		ghost.remove();
		return;
	}
	gsap
		.timeline()
		.to(
			ghost,
			{
				x: -STEP * way,
				autoAlpha: 0,
				duration: 0.14,
				ease: 'power2.in',
				onComplete: () => ghost.remove(),
			},
			0,
		)
		.fromTo(
			panel,
			{ x: STEP * way, autoAlpha: 0 },
			{
				x: 0,
				autoAlpha: 1,
				duration: 0.18,
				ease: 'power2.out',
				clearProps: 'transform,opacity,visibility',
			},
			0.06,
		);
}

/**
 * The world map turning into a globe and back: `state.t` carried to `to`, 0 flat and 1 round, over
 * 700 ms, most of the way in the first third and the rest settling, or at once for a reader who
 * asked for less motion. A new turn takes over from wherever the last one had got to.
 */
export function turn(state: { t: number }, to: 0 | 1): Promise<void> {
	gsap.killTweensOf(state);
	if (stilled()) {
		state.t = to;
		return Promise.resolve();
	}
	return new Promise((settle) => {
		gsap.to(state, { t: to, duration: 0.7, ease: 'power4.out', onComplete: settle });
	});
}

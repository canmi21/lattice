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

/**
 * A menu opening out of what was pressed: from a step smaller at its top left, where the title
 * that opened it stands, to its size, over 120 ms. An attachment, as `arrive` is.
 */
export function unfold(node: HTMLElement): void {
	if (stilled()) return;
	gsap.fromTo(
		node,
		{ autoAlpha: 0, scale: 0.98, y: -2, transformOrigin: 'top left' },
		{ autoAlpha: 1, scale: 1, y: 0, duration: 0.12, ease: 'power2.out', clearProps: 'transform' },
	);
}

/**
 * A surface growing out of what it stood as -- the sidebar's field into the finding panel -- from
 * `from`'s size to its own, rightward and downward from its top left, over 220 ms. Its own size is
 * measured as it stands, then it is set back to `from` and carried there.
 */
export function grow(node: HTMLElement, from: { width: number; height: number }): void {
	if (stilled()) return;
	const { width, height } = node.getBoundingClientRect();
	gsap.fromTo(
		node,
		{ width: from.width, height: from.height },
		{ width, height, duration: 0.22, ease: 'power3.out', clearProps: 'width,height' },
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

/**
 * A list's rows changing places: each row's height on the page taken, `change` run until the DOM
 * holds the new order, and each row that moved then slid from where it stood, over 450 ms. Rows
 * are told apart by `data-key`. At once where the reader asked for less motion or the page is not
 * being looked at, so a tab come back to is already in order.
 */
export async function reorder(list: HTMLElement, change: () => Promise<void>): Promise<void> {
	const rows = () => [...list.children] as HTMLElement[];
	if (stilled() || document.hidden) return change();
	gsap.killTweensOf(rows());
	gsap.set(rows(), { clearProps: 'transform' });
	const stood = new Map(rows().map((row) => [row.dataset.key, row.getBoundingClientRect().top]));
	await change();
	for (const row of rows()) {
		const was = stood.get(row.dataset.key);
		const by = was === undefined ? 0 : was - row.getBoundingClientRect().top;
		if (!by) continue;
		gsap.fromTo(
			row,
			{ y: by },
			{ y: 0, duration: 0.45, ease: 'power3.inOut', clearProps: 'transform' },
		);
	}
}

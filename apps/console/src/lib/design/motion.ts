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

/** A part of a menu that opens or closes in place, and which of the two. */
export interface Fold {
	node: HTMLElement;
	open: boolean;
}

/**
 * Groups of a menu opening and closing in place as one drawer: each one's rows hang whole under
 * its head and are drawn out of it or pushed back in, the last row first out, while its height
 * follows, so no row fades or is seen cut. Every fold is one timeline on one curve, quick at first
 * and settling, over 420 ms, so what one gives the other takes. At once where `now` is set, as the
 * menu itself opens, or for a reader who asked for less motion.
 */
export function fold(folds: readonly Fold[], now = false): void {
	gsap.killTweensOf(folds.flatMap(({ node }) => [node, ...node.children]));
	if (now || stilled()) {
		for (const { node, open } of folds) {
			gsap.set(node, { height: open ? 'auto' : 0 });
			gsap.set(node.children, { clearProps: 'transform' });
		}
		return;
	}
	const drawer = gsap.timeline({ defaults: { duration: 0.42, ease: 'power3.out' } });
	for (const { node, open } of folds) {
		const whole = node.scrollHeight;
		const from = node.offsetHeight;
		const to = open ? whole : 0;
		drawer.fromTo(
			node,
			{ height: from },
			{ height: to, onComplete: () => void (open && gsap.set(node, { height: 'auto' })) },
			0,
		);
		// The rows' foot kept on the fold's edge, so they travel with it rather than being uncovered.
		drawer.fromTo(
			node.children,
			{ y: from - whole },
			{ y: to - whole, clearProps: open ? 'transform' : '' },
			0,
		);
	}
}

/**
 * While a fold is under way, the rows sliding under a still pointer are not pointed at: `menu`'s
 * rows take no pointer until the 420 ms of a fold are over, so none lights up as it passes. The
 * menu itself still does, so a press meanwhile lands on it and not on the page under it.
 */
export function still(menu: HTMLElement): void {
	if (stilled()) return;
	const rows = [...menu.children];
	gsap.set(rows, { pointerEvents: 'none' });
	gsap.delayedCall(0.42, () => gsap.set(rows, { clearProps: 'pointerEvents' }));
}

/**
 * A frame whose words change its size carried there over 160 ms rather than cut: its first child,
 * laid out at its own size, is watched, and on a change the frame is set back to the size it
 * stood at and taken to the new one, its padding and border kept. An attachment; the frame clips
 * what it does not yet hold. See spec/console/design.md, "Motion is GSAP".
 */
export function reshape(frame: HTMLElement): () => void {
	const inner = frame.firstElementChild;
	if (!(inner instanceof HTMLElement)) return () => {};
	let stood = { width: frame.offsetWidth, height: frame.offsetHeight };
	const observer = new ResizeObserver(() => {
		const style = getComputedStyle(frame);
		const around = (...sides: string[]) =>
			sides.reduce((sum, side) => sum + Number.parseFloat(style.getPropertyValue(side)), 0);
		const to = {
			width:
				inner.offsetWidth +
				around('padding-left', 'padding-right', 'border-left-width', 'border-right-width'),
			height:
				inner.offsetHeight +
				around('padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width'),
		};
		const from = gsap.isTweening(frame)
			? { width: frame.offsetWidth, height: frame.offsetHeight }
			: stood;
		stood = to;
		if (stilled() || (from.width === to.width && from.height === to.height)) return;
		gsap.killTweensOf(frame);
		gsap.fromTo(frame, from, {
			...to,
			duration: 0.16,
			ease: 'power2.out',
			clearProps: 'width,height',
		});
	});
	observer.observe(inner);
	return () => {
		observer.disconnect();
		gsap.killTweensOf(frame);
	};
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

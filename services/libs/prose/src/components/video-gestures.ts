/**
 * What the frame is told by the page and the hand: whether the reader has scrolled near it, a
 * pointer arriving and leaving, and a finger pressing and wandering -- far enough to drop the
 * platform's long-press menu, never lifting into a tap -- which is a touch device's closest thing
 * to hovering. What each one means is `video-controls.svelte`'s; this only listens. See
 * spec/architecture/video/player.md, "On a pointer device" and "On a touch device".
 */

export type FrameEvents = {
	/** The frame came into view: at least 35% of it. */
	near: () => void;
	/** The frame went out of view. */
	far: () => void;
	/** A pointer arrived, on a device that hovers. */
	enter: () => void;
	/** A pointer left, on a device that hovers. */
	leave: () => void;
	/** A finger on the frame moved as a finger resting on it does not, on one that does not. */
	wander: () => void;
};

/**
 * Four pixels: past what a still finger drifts, short of what the platform reads as a drag.
 * Enough to say the finger is on the clip and moving rather than tapping it.
 */
const WANDER = 4;

/** Listen to `frame` for `on`, until the returned function is called. */
export function watchFrame(frame: HTMLElement, hovers: boolean, on: FrameEvents): () => void {
	const observer = new IntersectionObserver(
		([entry]) => (entry?.isIntersecting ? on.near() : on.far()),
		{ threshold: 0.35 },
	);
	observer.observe(frame);

	let down: { x: number; y: number } | null = null;
	const onStart = (event: TouchEvent) => {
		const touch = event.touches[0];
		down = touch ? { x: touch.clientX, y: touch.clientY } : null;
	};
	const onMove = (event: TouchEvent) => {
		const touch = event.touches[0];
		if (!down || !touch) return;
		if (Math.hypot(touch.clientX - down.x, touch.clientY - down.y) > WANDER) on.wander();
	};
	const onEnd = () => {
		down = null;
	};

	if (hovers) {
		frame.addEventListener('pointerenter', on.enter);
		frame.addEventListener('pointerleave', on.leave);
	} else {
		frame.addEventListener('touchstart', onStart, { passive: true });
		frame.addEventListener('touchmove', onMove, { passive: true });
		frame.addEventListener('touchend', onEnd, { passive: true });
	}

	return () => {
		observer.disconnect();
		frame.removeEventListener('pointerenter', on.enter);
		frame.removeEventListener('pointerleave', on.leave);
		frame.removeEventListener('touchstart', onStart);
		frame.removeEventListener('touchmove', onMove);
		frame.removeEventListener('touchend', onEnd);
	};
}

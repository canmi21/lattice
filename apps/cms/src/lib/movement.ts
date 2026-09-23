/**
 * How a panel here moves: the sidebar lifted from the left edge, the details drawer from the right,
 * a docked sidebar opening and closing across its width. One mechanism, so every panel answers the
 * same way.
 *
 * On the site's timing -- a surface answering a press, scaled by the distance it moves
 * (`@canmi/motion`). Played by the browser and held at its last frame until the caller has moved
 * the state the stylesheet reads, then cancelled, so nothing a movement wrote outlives it and the
 * resting place is always the rules' and never a leftover inline. A new movement cancels the one
 * in flight. Under reduced motion there is none. See spec/architecture/local.md.
 */
import { pressMotion, prefersReducedMotion } from '@canmi/motion';
import { tick } from 'svelte';

export class Movement {
	#playing: Animation | undefined;

	/** Move `element` through `keyframes`, timed for `pixels` of travel; the finished animation, held. */
	async play(
		element: HTMLElement,
		keyframes: Keyframe[],
		pixels: number,
	): Promise<Animation | undefined> {
		this.cancel();
		if (prefersReducedMotion()) return undefined;
		const timing = pressMotion(pixels);
		const animation = element.animate(keyframes, {
			duration: timing.duration * 1000,
			easing: `cubic-bezier(${timing.ease.join(', ')})`,
			fill: 'forwards',
		});
		this.#playing = animation;
		try {
			await animation.finished;
			return animation;
		} catch {
			return undefined; // cancelled by whatever replaced it
		}
	}

	/** Let a finished movement go, once the state it was moving toward is on the page. */
	async release(animation: Animation | undefined): Promise<void> {
		await tick();
		animation?.cancel();
		if (this.#playing === animation) this.#playing = undefined;
	}

	/** Stop whatever is moving, where it is. */
	cancel(): void {
		this.#playing?.cancel();
		this.#playing = undefined;
	}
}

/** Keyframes carrying a panel in from past `side` of where it rests, `distance` pixels away. */
export function arriving(side: 'left' | 'right', distance: number): Keyframe[] {
	const away = side === 'left' ? -distance : distance;
	return [{ transform: `translateX(${away}px)` }, { transform: 'translateX(0)' }];
}

/** The same, reversed: a panel leaving past `side`. */
export function leaving(side: 'left' | 'right', distance: number): Keyframe[] {
	return arriving(side, distance).toReversed();
}

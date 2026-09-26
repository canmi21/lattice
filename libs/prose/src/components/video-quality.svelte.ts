/**
 * Which rung a clip plays at: the one the reader picked, or the chooser's ("Auto"), and the one
 * actually playing, whoever picked it. Built once per clip by `video-controls.svelte`, while it
 * initializes, and its effects are that component's. See spec/architecture/video/player.md,
 * "Quality has an Auto, and it is where a clip starts".
 */
import type { VideoRung } from '@canmi/artifacts/types';
import { automatic, playing } from './video-rungs.ts';

export class Quality {
	/** The rung the reader picked, or undefined while the choice is the chooser's. */
	chosen = $state<string | undefined>(undefined);
	/** The rung the element is playing now, whoever chose it. */
	current = $state<VideoRung | undefined>(undefined);
	#shape: string | undefined;
	readonly #video: () => HTMLVideoElement | undefined;
	readonly #rungs: () => VideoRung[];
	readonly #settle: () => void;

	/**
	 * `shape` names the frame's size -- full screen, filling the window -- and `settle` is what the
	 * player redoes on a fresh source, its level.
	 */
	constructor(
		video: () => HTMLVideoElement | undefined,
		rungs: () => VideoRung[] | undefined,
		shape: () => string,
		settle: () => void,
	) {
		this.#video = video;
		this.#rungs = () => rungs() ?? [];
		this.#settle = settle;

		$effect(() => {
			const element = this.#video();
			if (!element) return;
			const read = () => (this.current = playing(element, this.#rungs()));
			read();
			element.addEventListener('loadedmetadata', read);
			element.addEventListener('emptied', read);
			return () => {
				element.removeEventListener('loadedmetadata', read);
				element.removeEventListener('emptied', read);
			};
		});

		/**
		 * While the choice is the chooser's, a frame that grows -- full screen, or filling the
		 * window -- is asked again, and moves up a rung if it now needs one. Only up: every swap
		 * interrupts the clip, and a frame going back to the column can keep the sharper picture it
		 * already has.
		 */
		$effect(() => {
			const now = shape();
			const before = this.#shape;
			this.#shape = now;
			const element = this.#video();
			if (before === undefined || before === now || this.chosen !== undefined || !element) return;
			requestAnimationFrame(() => {
				const wanted = automatic(element, this.#rungs());
				if (wanted && wanted.width > (this.current?.width ?? 0)) this.#swap(wanted.src);
			});
		});
	}

	/** What "Auto" would play for the frame as it is now. */
	suggest(): VideoRung | undefined {
		const element = this.#video();
		return element ? automatic(element, this.#rungs()) : undefined;
	}

	/** A rung the reader picks, or the choice handed back to the chooser when there is none. */
	pick(src: string | undefined): void {
		const element = this.#video();
		if (!element) return;
		this.chosen = src;
		const wanted = src ?? automatic(element, this.#rungs())?.src;
		if (wanted && wanted !== this.current?.src) this.#swap(wanted);
	}

	/**
	 * Quality, which the store cannot do for us: `videoRenditionList` is filled by an engine that
	 * knows about renditions -- hls.js, dash.js -- and our ladder is separate progressive files,
	 * so nothing fills it (measured, length 0 with four rungs on the page). So the swap is ours:
	 * remember the position, change the source, put it back, resume if it was playing. The seek
	 * lands on the nearest keyframe, which is why this is the one control that interrupts itself.
	 */
	#swap(src: string): void {
		const video = this.#video();
		if (!video) return;
		const at = video.currentTime;
		const running = !video.paused;
		video.src = src;
		video.load();
		video.currentTime = at;
		this.#settle();
		if (running) void video.play();
	}
}

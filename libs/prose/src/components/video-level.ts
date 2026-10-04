/**
 * The level, and the ceiling a reader may raise. `video.volume` is capped at 1, so anything
 * above it needs a `GainNode` and therefore `crossorigin`. Built once, lazily, since
 * `createMediaElementSource` takes the element's audio over for good with no way back --
 * which two things can push past the cap: the reader's own ceiling, and a clip quiet enough
 * that its levelling alone is above one. One per clip, held by `video-controls.svelte`.
 */
export class Level {
	#gain: GainNode | undefined;

	/** Play `video` at `wanted`, where 1 is the element's own full volume. */
	apply(video: HTMLVideoElement, wanted: number): void {
		if (wanted <= 1) {
			video.volume = wanted;
			if (this.#gain) this.#gain.gain.value = 1;
			return;
		}
		if (!this.#gain) {
			// **Only ever from a click.** Every caller of this is one -- the volume slider, the
			// mute button, a quality change -- and that matters more than it looks: a context
			// created without a gesture starts suspended, and once `createMediaElementSource` has
			// taken the element's audio a suspended context is not quiet, it is silent. `resume`
			// is the belt to that brace.
			//
			// A browser with no `AudioContext` keeps the cap instead of losing its sound.
			try {
				const context = new AudioContext();
				this.#gain = context.createGain();
				context.createMediaElementSource(video).connect(this.#gain).connect(context.destination);
				void context.resume();
			} catch {
				video.volume = 1;
				return;
			}
		}
		video.volume = 1;
		this.#gain.gain.value = wanted;
	}
}

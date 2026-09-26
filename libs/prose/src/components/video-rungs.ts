/**
 * Which rung a clip should play at, for the element that plays it now. `video.svelte` asks once,
 * when the element first says what it is; the controls ask again whenever the reader hands the
 * choice back ("Auto") or the frame changes size while it is theirs to make.
 */
import type { VideoRung } from '@canmi/artifacts/types';

/**
 * Which rung the display needs, once there is a display to ask.
 *
 * This function is the whole reason a chooser exists. A `<source>` is selected by its `type`
 * and never by its size, so a browser handed two rungs takes the first one it can decode
 * rather than the one it needs, and `srcset` has no equivalent here -- there is nowhere in
 * the markup to say "this many pixels wide". So the smallest rung that covers the physical
 * width wins, and nothing above it buys a pixel the column can show.
 */
export function chooseRung(available: VideoRung[], rendered: number, ratio: number): VideoRung {
	const needed = rendered * ratio;
	return available.find((rung) => rung.width >= needed) ?? available[available.length - 1]!;
}

/** The rungs this element can decode, in the order the ladder lists them. */
export function playable(video: HTMLVideoElement, rungs: VideoRung[]): VideoRung[] {
	return rungs.filter((rung) => video.canPlayType(rung.type) !== '');
}

/** The rung this element would play if the choice were left to it, or none when it can play none. */
export function automatic(video: HTMLVideoElement, rungs: VideoRung[]): VideoRung | undefined {
	const choices = playable(video, rungs);
	if (choices.length === 0) return undefined;
	return chooseRung(choices, video.clientWidth, window.devicePixelRatio);
}

/** The rung the element is playing, by the address it resolved. */
export function playing(video: HTMLVideoElement, rungs: VideoRung[]): VideoRung | undefined {
	const at = video.currentSrc;
	if (!at) return undefined;
	return rungs.find((rung) => new URL(rung.src, document.baseURI).href === at);
}

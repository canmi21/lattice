/**
 * Where a clip's captions sit and where they break, decided when the shape changes and at no
 * other time.
 *
 * See spec/architecture/video/captions.md, "A caption is set in the page's voice and placed in
 * the black", for the whole account: why a bar only gets the caption once it is comfortably
 * taller than one (`CUE_ROOM`), why cues are positioned against the element box rather than the
 * picture, and why the answer is recomputed on shape rather than on cues.
 */
const CUE_LINES = 2;
/**
 * The caption's own height, in multiples of its size: 1.35 is `::cue`'s line-height in
 * `video.svelte`, and the plate is painted to exactly that box, nothing added around it. See
 * spec/architecture/video/captions.md, "A caption is set in the page's voice and placed in the
 * black", for the measurement against a real caption.
 */
const CUE_BLOCK = 1.35 * CUE_LINES;
/**
 * How much taller than the caption a bar has to be before the caption is put in it.
 *
 * A bar that merely fits the caption is not a place to put one. At 1.5 the leftover is half a
 * caption, a quarter of one above and a quarter below, which is the least that reads as a
 * caption sitting in a bar rather than filling it. Measured on a 1000x730 window before this
 * existed: a bar of 83.8 took a caption block of 73.2 and left 5.3px of black under the
 * descenders, which is the failure this number is against.
 */
const CUE_ROOM = 1.5;
/**
 * How far above the picture's bottom edge a caption sits, in multiples of the caption's own
 * size -- the same gap looks half as big under a caption twice the size. At 0.8 the article
 * keeps its old 13.2px gap, 12.8px. See spec/architecture/video/captions.md, "A caption is set in
 * the page's voice and placed in the black", for what this replaced.
 */
const CUE_CLEAR = 0.8;
/**
 * What stands in for the plate's horizontal padding: `::cue` cannot be padded, so a
 * non-collapsing space sits on each side of every line instead. Thin space gives 4px a side,
 * the finest available short of a class of its own scaled by `font-size` -- see
 * spec/architecture/video/captions.md, "A caption is set in the page's voice and placed in the
 * black", for the measurement and the alternatives it beat.
 */
const CUE_PAD = '\u2009';
/** A caption reads at a size taken from the picture, between these two. */
const CUE_MIN = 14;
const CUE_MAX = 30;
const CUE_SCALE = 0.042;

/**
 * How much of the picture a caption may fill before it is worth breaking (`KEEP`), and how
 * full the first line aims to be when it does break (`FILL`, short of `KEEP` on purpose). The
 * file's own break point is a suggestion about where, not about whether -- see
 * spec/architecture/video/captions.md, "A caption is set in the page's voice and placed in the
 * black", for why and for the measurement.
 */
const CUE_KEEP = 0.9;
const CUE_FILL = 0.8;
/** What stopping at a clause is worth, against how unequal it leaves the two lines. */
const CUE_NUDGE = 0.08;

/**
 * What the files say, kept so that re-measuring is idempotent.
 *
 * Every recompute rewrites `text`, so without the original the second pass would be measuring
 * the first pass's answer and the caption would drift a word at a time.
 */
const written = new WeakMap<TextTrackCue, string>();

/** One canvas for every measurement the player ever makes. */
let ruler: CanvasRenderingContext2D | null | undefined;

/**
 * Where to break a caption that has to break, which is a separate question from whether.
 * Candidates are the places a reader would accept one: after punctuation, and at a space.
 * **Balanced rather than first-line-filled** -- see spec/architecture/video/captions.md, "A
 * caption is set in the page's voice and placed in the black", for why filling strands a word.
 * Failing `FILL` entirely, the shortest first line under `KEEP` is taken instead, and failing
 * that the text is left whole.
 */
function breakAt(text: string, measure: (value: string) => number, width: number): string {
	const candidates: { at: number; punctuated: boolean }[] = [];
	for (let i = 1; i < text.length; i++) {
		const before = text[i - 1] ?? '';
		const here = text[i] ?? '';
		const punctuated = /[,.;:!?—、。，；：！？]/.test(before);
		if (punctuated || here === ' ') candidates.push({ at: i, punctuated });
	}
	const scored = candidates
		.map((c) => ({ ...c, head: text.slice(0, c.at).trim(), tail: text.slice(c.at).trim() }))
		.filter((c) => c.head && c.tail)
		.map((c) => ({ ...c, size: measure(c.head) }));
	const weighed = scored
		.map((c) => ({ ...c, rest: measure(c.tail) }))
		.filter((c) => c.size <= width * CUE_FILL && c.rest <= width * CUE_FILL)
		.map((c) => ({
			...c,
			// Lower is better: how unequal the two lines are, less a nudge for stopping at a
			// clause rather than mid-sentence.
			cost: Math.abs(c.size - c.rest) - (c.punctuated ? width * CUE_NUDGE : 0),
		}));
	const chosen =
		weighed.sort((a, b) => a.cost - b.cost)[0] ??
		scored.filter((c) => c.size <= width * CUE_KEEP).sort((a, b) => a.size - b.size)[0];
	return chosen ? [chosen.head, chosen.tail].join('\n') : text;
}

export function placeCaptions(element: HTMLVideoElement): void {
	const box = element.getBoundingClientRect();
	if (!box.height || !element.videoWidth || !element.videoHeight) return;

	const shown = Math.min(box.height, (box.width * element.videoHeight) / element.videoWidth);
	const size = Math.min(CUE_MAX, Math.max(CUE_MIN, shown * CUE_SCALE));
	element.style.setProperty('--cue-size', `${Math.round(size)}px`);

	// `cover` fills the box, so the picture is the box and there is nothing to move out of.
	const fitted = getComputedStyle(element).objectFit === 'contain';
	const bar = fitted ? (box.height - shown) / 2 : 0;
	const block = size * CUE_BLOCK;
	// One expression for both places a caption can go, because the bar being absent and the
	// bar being too shallow want the same answer: the bottom of the picture, held off it.
	const bottom =
		bar >= block * CUE_ROOM
			? // Centred in the bar: half the leftover above the caption, half below.
				box.height - (bar - block) / 2
			: box.height - bar - size * CUE_CLEAR;
	const line = Math.min(100, Math.max(0, (bottom / box.height) * 100));

	// The picture's own width, not the box's: in full screen the bars are part of the element
	// and no part of what a caption has to fit across.
	const across = Math.min(box.width, (box.height * element.videoWidth) / element.videoHeight);
	ruler ??= document.createElement('canvas').getContext('2d');
	const face = getComputedStyle(element).fontFamily;
	if (ruler) ruler.font = `${size}px ${face}`;
	// Every measurement is of the padded line, because the padding is part of the plate and the
	// plate is what has to fit across the picture. Both halves of a break gain the same amount,
	// so the balance the break is chosen on is unaffected and only the thresholds move.
	const measure = (value: string) => ruler?.measureText(CUE_PAD + value + CUE_PAD).width ?? 0;
	const padded = (value: string) =>
		value
			.split('\n')
			.map((row) => CUE_PAD + row + CUE_PAD)
			.join('\n');

	for (const track of element.textTracks) {
		for (const cue of track.cues ?? []) {
			(cue as VTTCue).snapToLines = false;
			// Assigned before `line`, because `line` is validated against it.
			if ('lineAlign' in cue) (cue as VTTCue).lineAlign = 'end';
			(cue as VTTCue).line = line;

			if (!written.has(cue)) written.set(cue, (cue as VTTCue).text);
			const original = written.get(cue) ?? '';
			const joined = original.replaceAll('\n', ' ').replaceAll(/\s+/g, ' ').trim();
			if (!ruler || !joined) continue;
			(cue as VTTCue).text = padded(
				measure(joined) <= across * CUE_KEEP ? joined : breakAt(joined, measure, across),
			);
		}
	}
}

/**
 * How wide each bar in the table of contents draws, derived from the article's own headings.
 *
 * A bar stands for a heading and is as long as that heading is, so the rail is a shape of this
 * article rather than a list of equal ticks. Nothing here touches the page it is for: the text
 * comes from the view, the fonts from the stylesheet and the width from the rail's own measure,
 * which is what lets a navigation work this out before it paints. See
 * spec/styling/first-paint.md, "A page declares what only a browser can work out".
 */

import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext';

/**
 * The scale the bars are drawn on, and the shape of the column they make.
 *
 * Moved here from the component with the arithmetic that uses it: what is stored for the rest of
 * a sitting has to be the width a bar is drawn at, not a natural width somebody still has to turn
 * into one. Every number is argued in spec/styling/rail.md.
 */
const MAX_BAR_WIDTH = 64;
const STEPS = 10;
const MAX_ADJACENT_STEP = 3;
const MIN_ADJACENT_STEP = 1;
const RESTING_STEP = 3;

/**
 * A stable number for a string, so a tie is broken the same way on every render.
 *
 * FNV-1a, which is a few lines and has no other requirement here than that two headings that
 * differ anywhere land on different numbers. Nothing depends on it being hard to reverse.
 */
function textHash(text: string): number {
	let hash = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/**
 * Bar widths, in tenths of the longest heading.
 *
 * See spec/styling/rail.md, "Collapsed, the bars are a thumbnail of the list", for why a tenth is
 * the right grain and why the scale is the longest heading rather than the shortest-to-longest
 * spread.
 */
export function steppedBars(widths: number[], texts: string[], ceiling: number): number[] {
	if (widths.length === 0) return [];
	// A bar may never be wider than the widest label -- see spec/styling/rail.md, "A bar may never
	// be wider than the widest label".
	const longest = Math.min(MAX_BAR_WIDTH, ceiling > 0 ? ceiling : MAX_BAR_WIDTH);
	const max = Math.max(...widths);
	if (max < 1) return widths.map(() => longest / 2);

	const steps = widths.map((w) => Math.min(STEPS, Math.max(1, Math.round((w / max) * STEPS))));

	// Bring the peaks down until no entry stands more than `MAX_ADJACENT_STEP` above a
	// neighbour. Two passes, forward and back, make the constraint hold both ways. Down
	// rather than up, and only ever toward a neighbour, never levelled with it -- see
	// spec/styling/rail.md, "No entry stands more than three steps above a neighbour, and the
	// outlier comes down".
	const flatten = (from: number[]): number[] => {
		const out: number[] = [];
		for (const step of from) {
			const previous = out.at(-1);
			out.push(previous === undefined ? step : Math.min(step, previous + MAX_ADJACENT_STEP));
		}
		return out;
	};
	const shaved = flatten(flatten(steps).reverse()).reverse();

	// The other half of the same idea: two neighbours on the same step are separated by one,
	// toward whichever side they were already nearer. Both constraints run in one pass --
	// applied separately, the second would undo the first. See spec/styling/rail.md, "Two
	// neighbours on the same step are separated by one step", including the tie-break rule.
	const settled: number[] = [];
	shaved.forEach((step, index) => {
		const previous = settled.at(-1);
		if (previous === undefined) {
			settled.push(step);
			return;
		}
		const held = Math.min(
			previous + MAX_ADJACENT_STEP,
			Math.max(previous - MAX_ADJACENT_STEP, step),
		);
		if (Math.abs(held - previous) >= MIN_ADJACENT_STEP) {
			settled.push(held);
			return;
		}
		// Moved just far enough to be a second mark rather than a repeat of the first. The
		// separation is the point, not the distance: these two headings are the same length,
		// and a bigger push would say they are not.
		const down = Math.max(1, previous - MIN_ADJACENT_STEP);
		const up = Math.min(STEPS, previous + MIN_ADJACENT_STEP);
		// At either end of the scale one of the two directions is not a move at all -- from
		// the tenth step, "up" is the tenth step. Whichever side still has somewhere to go
		// takes it, and only a genuine choice between two of them consults the text.
		const canGoDown = previous - down >= MIN_ADJACENT_STEP;
		const canGoUp = up - previous >= MIN_ADJACENT_STEP;
		if (!canGoDown && !canGoUp) {
			settled.push(held);
			return;
		}
		if (canGoDown !== canGoUp) {
			settled.push(canGoDown ? down : up);
			return;
		}
		const toDown = Math.abs(step - down);
		const toUp = Math.abs(step - up);
		if (toDown !== toUp) {
			settled.push(toDown < toUp ? down : up);
			return;
		}
		settled.push(textHash(texts[index] ?? '') % 2 === 0 ? down : up);
	});

	// Finally, slide the whole column down if nothing in it reaches the low end of the scale.
	// A shift, not a rescale: every difference above was chosen against the two rules, and
	// rescaling would quietly undo them. Moving all of the steps by one amount changes none of
	// them.
	const lowest = Math.min(...settled);
	const excess = Math.max(0, lowest - RESTING_STEP);

	return settled.map((step) => ((step - excess) / STEPS) * longest);
}

/** The fonts two different measurements are taken in; see `railWidths`. */
export type RailFonts = { heading: string; label: string };

/** What the rail needs before it can draw itself, and the whole of it. */
export type RailWidths = {
	/** One width per entry, as the bar is drawn: already stepped, shaved and settled. */
	widths: number[];
	/** The widest label as the rail will draw it, which is the widest a bar may be. */
	ceiling: number;
};

/**
 * Two measurements per entry, in two fonts, because they answer two questions.
 *
 * The bar's length is the heading's natural width in the heading's own font -- that is the fact
 * about the article. How many lines it takes is a question about the rail, so it is measured in
 * the label's font at the rail's width; the two are not proportional. See spec/styling/rail.md,
 * "An entry that wraps contributes half its width per line".
 */
export function railWidths(
	toc: readonly { text: string }[],
	fonts: RailFonts,
	available: number,
): RailWidths {
	const usable = Number.isFinite(available) && available > 0 ? available : 0;
	let ceiling = 0;
	const widths = toc.map(({ text }) => {
		const natural = measureNaturalWidth(prepareWithSegments(text, fonts.heading));
		if (usable === 0) return natural;
		const label = measureNaturalWidth(prepareWithSegments(text, fonts.label));
		const lines = Math.min(2, Math.max(1, Math.ceil(label / usable)));
		// What the label actually occupies: it cannot exceed the rail, which is where it wraps.
		ceiling = Math.max(ceiling, Math.min(label, usable));
		return natural / lines;
	});
	return {
		widths: steppedBars(
			widths,
			toc.map(({ text }) => text),
			ceiling,
		),
		ceiling,
	};
}

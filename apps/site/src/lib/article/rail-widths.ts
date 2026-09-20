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

/** The fonts two different measurements are taken in; see `railWidths`. */
export type RailFonts = { heading: string; label: string };

/** What the rail needs before it can draw itself, and the whole of it. */
export type RailWidths = {
	/** One natural width per entry, already divided by the lines its label takes. */
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
	return { widths, ceiling };
}

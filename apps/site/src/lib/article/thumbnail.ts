/**
 * What an article's thumbnail is shaped like, derived from the article rather than from the page.
 *
 * Five bars standing for a title and four lines of body. Their proportions come from the real
 * widths of the real text, so the miniature is of this article and not of an article in general.
 *
 * It is a module and not part of the component because it has to run in two places: in a `load`,
 * before the page it belongs to is drawn, and in the component itself on the one render where the
 * server could not do it. See spec/styling/first-paint.md.
 */

import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext';

/** What one bar is, in the units the markup writes. */
export type Bar = { width: number; gap: number };

// Bar widths map straight into the range taken from the first frame's bars: shortest (12) to
// longest (32), no quantization. The title stays within the first half so it reads as a short
// heading.
const BODY_MIN = 12;
const BODY_MAX = 32;
const TITLE_MIN = 11;
const TITLE_MAX = 16;
const TITLE_GAP = 8;
const LINE_GAP = 4;
// The first frame is the ideal-looking shape; the body only leans toward real proportions by
// BLEND, so icons stay pretty while differing a little.
const IDEAL_BODY = [32, 24, 20, 12];
const BLEND = 0.35;

/** What the thumbnail is drawn from: the two fields that decide its proportions. */
export type Thumbnailed = { meta: { title: string }; path: string; paragraphs: string[] };

function lerp(min: number, max: number, t: number): number {
	return min + Math.min(1, Math.max(0, t)) * (max - min);
}

/**
 * Which body gap is the separator, picked from the path.
 *
 * Deterministic, so the split varies between articles and is stable for a given one -- a
 * measurement taken in a `load` and the same one taken in an effect have to agree.
 */
function separatorGap(seed: string): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	return 1 + (h % 3);
}

/** Up to four clauses from the leading paragraphs, split on sentence punctuation. */
function clauses(paragraphs: string[]): string[] {
	const out: string[] = [];
	for (const paragraph of paragraphs) {
		out.push(
			...paragraph
				.split(/[。．.!?！？，,;；\n]+/)
				.map((piece) => piece.trim())
				.filter((piece) => piece.length >= 2),
		);
		if (out.length >= 4) break;
	}
	return out.slice(0, 4);
}

/**
 * Every article's five bars, normalised across the list.
 *
 * Titles are normalised list-wide, so they vary against each other; each article's body is
 * normalised against its own shortest and longest clause. That is why this takes the whole list
 * rather than one article: a bar's width is a fact about where this article sits among them.
 */
export function thumbnails(articles: readonly Thumbnailed[], font: string): Bar[][] {
	const natural = (piece: string) => measureNaturalWidth(prepareWithSegments(piece, font));
	const titles = articles.map((article) => natural(article.meta.title));
	const lowest = Math.min(...titles);
	const highest = Math.max(...titles);

	return articles.map((article, index) => {
		const title = titles[index] ?? 0;
		const fill = highest > lowest ? (title - lowest) / (highest - lowest) : 0.5;
		const bars: Bar[] = [{ width: Math.round(lerp(TITLE_MIN, TITLE_MAX, fill)), gap: 0 }];

		const lines = clauses(article.paragraphs).map(natural);
		const shortest = lines.length ? Math.min(...lines) : 0;
		const longest = lines.length ? Math.max(...lines) : 1;
		const separator = separatorGap(article.path);
		IDEAL_BODY.forEach((ideal, line) => {
			const measured = lines[line];
			const content =
				measured === undefined
					? ideal
					: lerp(
							BODY_MIN,
							BODY_MAX,
							longest > shortest ? (measured - shortest) / (longest - shortest) : 0.7,
						);
			bars.push({
				width: Math.round(ideal * (1 - BLEND) + content * BLEND),
				// The title gap and the chosen body separator share one size; the rest are small.
				gap: line === 0 || line === separator ? TITLE_GAP : LINE_GAP,
			});
		});
		return bars;
	});
}

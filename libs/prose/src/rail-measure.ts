/**
 * The browser half of the rail's measurement: where its two fonts and its width come from.
 *
 * Kept apart from `rail-widths.ts`, which is the arithmetic and touches no document. This is the
 * part that has to ask the stylesheet, and it asks it through the classes their owners export
 * rather than through a second copy of the same values.
 */

import { ARTICLE_BODY_CLASS } from './article-body.ts';
import { SECTION_TITLE_CLASS } from './section-title.ts';
import { TOC_LABEL_CLASS } from './toc-label.ts';
import { fontOfProbe } from './measured.ts';
import { railWidths, type RailWidths } from './rail-widths';

/**
 * How wide the rail is, read from the declaration rather than from a copy of it.
 *
 * `--rail-width` is on `:root` and is the same on every article and in every language -- it is
 * also what the CMS holds a translated heading to. Reading the custom property means the
 * measurement cannot drift from the box it is measuring for. See spec/styling/rail.md.
 */
function railPixels(): number {
	const root = getComputedStyle(document.documentElement);
	const declared = root.getPropertyValue('--rail-width').trim();
	const rem = Number.parseFloat(declared);
	if (!Number.isFinite(rem)) return 0;
	// The declaration is in rem, and a canvas measures in pixels.
	return declared.endsWith('rem') ? rem * (Number.parseFloat(root.fontSize) || 16) : rem;
}

/**
 * Every bar's width for this article's headings, without the article being on screen.
 *
 * The heading's font needs the body around it as well as its own class, which is why this is a
 * chain: `600` comes from one component and the size from the other, and neither alone resolves
 * to what a heading actually is.
 */
export function measureRail(toc: readonly { text: string }[]): RailWidths {
	return railWidths(
		toc,
		{
			heading: fontOfProbe([
				['div', ARTICLE_BODY_CLASS],
				['h2', SECTION_TITLE_CLASS],
			]),
			label: fontOfProbe([['span', TOC_LABEL_CLASS]]),
		},
		railPixels(),
	);
}

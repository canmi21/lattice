/**
 * What a glyph in this directory takes: drawings the CMS owns because it needs shapes Lucide does
 * not draw, each reproducing Lucide's own component (a 24 viewBox, a 2 stroke with round caps and
 * joins, `currentColor`, a `size` and a `class`) so a caller swapping one for a Lucide import
 * changes only the name. The same arrangement the site's player makes with Phosphor, in
 * libs/prose/src/components/video-glyphs.
 */
import type { SVGAttributes } from 'svelte/elements';

export interface GlyphProps extends Omit<SVGAttributes<SVGSVGElement>, 'color'> {
	color?: string;
	size?: number | string;
	strokeWidth?: number | string;
}

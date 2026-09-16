/**
 * What a glyph in this directory takes: drawings this repository owns because the player needs
 * three shapes Phosphor does not draw, each reproducing Phosphor's own component (256 viewBox,
 * `currentColor` fill, `1em` size, transparent backing rect, `mirrored` escape hatch) so a caller
 * swapping one for a `phosphor-svelte` import changes only the name. `weight` is missing because
 * these have only the one, bold, that a shape meaning an opening rather than a mass needs; five
 * more would be five lies. `IconContext` is missing because Phosphor's own is unreachable through
 * the package's exports map, and the player sets no context anyway. Each glyph carries its own
 * copy of the element rather than a shared shell: `svelte-check` rejects spreading `SVGAttributes`
 * between components as a union too complex to represent, the same reason Phosphor's own files
 * each hold their own.
 */
import type { SVGAttributes } from 'svelte/elements';

export interface GlyphProps extends Omit<SVGAttributes<SVGSVGElement>, 'color'> {
	color?: string;
	size?: number | string;
	mirrored?: boolean;
}

/**
 * What a glyph in this directory takes.
 *
 * These are drawings this repository owns rather than icons taken from a set, and they exist
 * because the player needs three shapes Phosphor does not draw. They still sit in a row next to
 * nine that do, so each one reproduces Phosphor's own component: the same 256 viewBox, the same
 * `currentColor` fill, the same `1em` default size, the same transparent backing rect, the same
 * `mirrored` escape hatch, and everything else passed through to the element. A caller swapping
 * one of these for a `phosphor-svelte` import changes the name and nothing else.
 *
 * What is missing is `weight`. Phosphor ships six drawings of every glyph; these have one, bold,
 * because bold is the weight the player uses for a shape whose meaning lives in an opening rather
 * than in a mass. A prop offering five more would be five lies.
 *
 * `IconContext` is missing for a duller reason: Phosphor's context module is not reachable
 * through the package's exports map, which resolves `./lib/*` only to `.svelte` files. The player
 * sets no context anyway.
 *
 * Each glyph carries its own copy of the element rather than rendering through a shared shell.
 * The shell was written first and `svelte-check` rejected it -- spreading `SVGAttributes` from one
 * component into another produces "a union type that is too complex to represent" -- which is the
 * same reason Phosphor's nine thousand files each hold their own.
 */
import type { SVGAttributes } from 'svelte/elements';

export interface GlyphProps extends Omit<SVGAttributes<SVGSVGElement>, 'color'> {
	color?: string;
	size?: number | string;
	mirrored?: boolean;
}

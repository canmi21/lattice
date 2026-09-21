/**
 * Which layer owns which property: the enumeration itself, as data.
 *
 * The argument for every entry is spec/architecture/css/layers.md, "What each layer owns, by
 * name"; this is the list that argument produced, and nothing here re-derives it. It is a keyed
 * object rather than the JSON beside `css-budget.ts` because the guarantee wanted is
 * exhaustiveness: a property named twice is a type error here and only a runtime surprise there,
 * and the check, the gate and anything else that has to agree with the table import one constant.
 * See spec/architecture/css/procedure.md, "The enumeration is data, and this file is not where it
 * lives". Run `node apps/site/scripts/css-enumeration.ts --list` to print it expanded.
 */

/** Which layer a property belongs to, or why the table cannot answer for it alone. */
export type Layer =
	| 'frame'
	| 'vocabulary'
	/** Decided by the site rather than by the property: a member of a reused surface, or not. */
	| 'site'
	/** Bundles properties this table splits between layers, so it is written as longhands. */
	| 'shorthand';

/**
 * The properties layers.md names, in kebab-case as CSS spells them.
 *
 * Duplicate keys are a type error, which is the whole reason this is an object literal: the one
 * failure a hand-kept table has is a property listed in two layers, and that is the failure
 * layers.md records having happened to `white-space`.
 */
export const OWNS = {
	// Colour, in all its spellings.
	color: 'vocabulary',
	'background-color': 'vocabulary',
	'border-color': 'vocabulary',
	'outline-color': 'vocabulary',
	fill: 'vocabulary',
	stroke: 'vocabulary',

	// Edge and surface.
	'border-radius': 'vocabulary',
	'border-width': 'vocabulary',
	'border-style': 'vocabulary',
	'box-shadow': 'vocabulary',
	opacity: 'vocabulary',
	'outline-style': 'vocabulary',
	'outline-width': 'vocabulary',

	// Appearance, all of it already inside the player's reused surfaces.
	filter: 'vocabulary',
	'backdrop-filter': 'vocabulary',
	'background-image': 'vocabulary',
	'text-shadow': 'vocabulary',

	// Motion, as longhands.
	'transition-property': 'vocabulary',
	'transition-duration': 'vocabulary',
	'transition-timing-function': 'vocabulary',
	'transition-delay': 'vocabulary',
	'transition-behavior': 'vocabulary',
	'animation-name': 'vocabulary',
	'animation-duration': 'vocabulary',
	'animation-timing-function': 'vocabulary',
	'animation-delay': 'vocabulary',
	'animation-iteration-count': 'vocabulary',
	'animation-direction': 'vocabulary',
	'animation-fill-mode': 'vocabulary',
	'animation-play-state': 'vocabulary',
	'animation-composition': 'vocabulary',
	'animation-range': 'vocabulary',
	'animation-timeline': 'vocabulary',

	// The type ramp.
	'font-size': 'vocabulary',
	'line-height': 'vocabulary',
	'font-weight': 'vocabulary',
	'letter-spacing': 'vocabulary',
	'font-family': 'vocabulary',
	'font-variant-numeric': 'vocabulary',

	// Stroke, beside the colour already listed.
	'stroke-width': 'vocabulary',
	'stroke-linecap': 'vocabulary',

	// Box and flow.
	display: 'frame',
	'flex-direction': 'frame',
	'flex-wrap': 'frame',
	'flex-grow': 'frame',
	'flex-shrink': 'frame',
	'flex-basis': 'frame',
	order: 'frame',
	'grid-template-columns': 'frame',
	'grid-template-rows': 'frame',
	'grid-template-areas': 'frame',
	'grid-auto-columns': 'frame',
	'grid-auto-rows': 'frame',
	'grid-auto-flow': 'frame',
	'grid-column': 'frame',
	'grid-row': 'frame',
	'grid-area': 'frame',
	gap: 'frame',
	'row-gap': 'frame',
	'column-gap': 'frame',
	margin: 'frame',
	padding: 'frame',
	width: 'frame',
	height: 'frame',
	'min-width': 'frame',
	'min-height': 'frame',
	'max-width': 'frame',
	'max-height': 'frame',
	'aspect-ratio': 'frame',
	position: 'frame',
	inset: 'frame',
	'z-index': 'frame',
	'align-items': 'frame',
	'align-self': 'frame',
	'align-content': 'frame',
	'justify-items': 'frame',
	'justify-self': 'frame',
	'justify-content': 'frame',
	overflow: 'frame',
	'overflow-x': 'frame',
	'overflow-y': 'frame',
	visibility: 'frame',
	'pointer-events': 'frame',
	'user-select': 'frame',
	'will-change': 'frame',
	'border-collapse': 'frame',

	// Text behaviour, which has no house scale and no plausible one.
	'white-space': 'frame',
	'text-wrap': 'frame',
	'overflow-wrap': 'frame',
	'word-break': 'frame',
	'line-break': 'frame',
	hyphens: 'frame',
	'text-overflow': 'frame',
	'text-align': 'frame',

	// The underline, whole. A suppressed UA default takes its value from no scale, and splitting
	// the colour off the line would run one underline across two layers.
	'text-decoration-line': 'frame',
	'text-decoration-color': 'frame',
	'text-decoration-style': 'frame',
	'text-decoration-thickness': 'frame',
	'text-underline-offset': 'frame',

	// Split by site: a member of a reused surface, or written once and therefore the frame.
	cursor: 'site',
	transform: 'site',
	'text-transform': 'site',
	scale: 'site',
	rotate: 'site',
	translate: 'site',

	// Written as longhands, always. Each bundles properties this table splits.
	transition: 'shorthand',
	animation: 'shorthand',
	border: 'shorthand',
	background: 'shorthand',
} satisfies Record<string, Layer>;

/**
 * The type ramp, which layers.md names as a list inside the vocabulary rather than beside it --
 * "The type ramp is vocabulary by property, and takes its value from a token". Here so that the
 * ramp and the layer it belongs to are one table and cannot part company.
 */
export const RAMP = [
	'font-size',
	'line-height',
	'font-weight',
	'letter-spacing',
	'font-family',
	'font-variant-numeric',
];

/**
 * Whether a property is one of the ramp's six, through whatever spelling or longhand.
 *
 * Here rather than in either gate because both ask it, and the answer is the line that drifts:
 * css-ramp.ts asks it of a declaration, css-extraction.ts of every declaration reading a name.
 */
export function isRampProperty(property: string, owners: Map<string, Owner>): boolean {
	const says = owner(property, owners);
	return says !== undefined && RAMP.includes(says.via);
}

/** The sides a box property splits into, physical and logical. */
const EDGES = [
	'top',
	'right',
	'bottom',
	'left',
	'block-start',
	'block-end',
	'inline-start',
	'inline-end',
];

/** The corners a radius splits into, physical and logical. */
const CORNERS = [
	'top-left',
	'top-right',
	'bottom-right',
	'bottom-left',
	'start-start',
	'start-end',
	'end-start',
	'end-end',
];

/**
 * Families whose per-edge longhands take the family's layer.
 *
 * Splitting `border-top-width` from `border-width` would run one border across two layers, which
 * is the argument layers.md already makes for keeping `outline-style` beside `outline-color`. So
 * this is the table's own ruling applied to the spelling, never a second ruling.
 */
const SPLITS: { family: string; prefix: string; suffix: string; parts: string[] }[] = [
	{ family: 'border-width', prefix: 'border', suffix: 'width', parts: EDGES },
	{ family: 'border-style', prefix: 'border', suffix: 'style', parts: EDGES },
	{ family: 'border-color', prefix: 'border', suffix: 'color', parts: EDGES },
	{ family: 'border-radius', prefix: 'border', suffix: 'radius', parts: CORNERS },
	{ family: 'margin', prefix: 'margin', suffix: '', parts: EDGES },
	{ family: 'padding', prefix: 'padding', suffix: '', parts: EDGES },
	{ family: 'inset', prefix: 'inset', suffix: '', parts: EDGES },
];

/** A vendor prefix changes the spelling of a property, never which layer owns it. */
const VENDOR = /^-(?:webkit|moz|ms|o)-/;

/** What the table says about one property, and which entry said it. */
export type Owner = { layer: Layer; via: string };

/**
 * The families whose longhands are derived, for a caller to check against `OWNS` itself.
 *
 * A family with no entry derives nothing, and its longhands then read as properties the table
 * never named -- a message pointing at the code rather than at the table that lost the row. So
 * the list is exported and the gate checks it, instead of `table()` skipping the row in silence.
 */
export function families(): string[] {
	return SPLITS.map((split) => split.family);
}

/** The table as every consumer reads it: one entry per spelling, longhands expanded. */
export function table(): Map<string, Owner> {
	const owners = new Map<string, Owner>();
	for (const [property, layer] of Object.entries(OWNS)) {
		owners.set(property, { layer, via: property });
	}
	for (const split of SPLITS) {
		const family = owners.get(split.family);
		if (family === undefined) continue;
		for (const part of split.parts) {
			const suffix = split.suffix === '' ? '' : `-${split.suffix}`;
			owners.set(`${split.prefix}-${part}${suffix}`, { layer: family.layer, via: split.family });
		}
	}
	return owners;
}

/** The CSS spelling of a property StyleX writes in camelCase: `borderTopWidth`, `WebkitMask`. */
export function kebab(property: string): string {
	return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** What the table says about a property as StyleX spells it, or undefined where it says nothing. */
export function owner(property: string, owners: Map<string, Owner>): Owner | undefined {
	const css = kebab(property);
	return owners.get(css) ?? owners.get(css.replace(VENDOR, ''));
}

/** Whether a key declares a custom property, which is outside the table rather than missing. */
export function isCustomProperty(property: string): boolean {
	return property.startsWith('--');
}

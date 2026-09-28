import type { Divider } from '@canmi/behavior/resize';

/**
 * The sidebar's narrowest width, measured rather than chosen: the widest single-line section row
 * (References, whose label ends 116.65px from the window's edge) plus, after it, the same room its
 * icon keeps from the window's left edge (20px), less the ground's edge and the divider in between.
 * That came to 120.65px, and this is the next eighth of a rem above it. Measure again if a section
 * with a longer label is added, or the row's padding changes.
 */
const SIDEBAR_MIN = 7.625;

/**
 * The site's article column, `--rail-column` in libs/prose/src/rail.css -- the container an
 * article is set in, gutter included. Restated here because a media query cannot read a custom
 * property; `sidebar.test.ts` holds the two together.
 */
export const ARTICLE_COLUMN = 45;

/** The pane's own inset on each side, `px-8` in `(pane)/+layout.svelte`. */
const PANE_INSET = 2;

/** The ground's edge on each side, `p-2`, and the divider between the two regions, `w-2`. */
const GROUND_EDGE = 0.5;
const DIVIDER_WIDTH = 0.5;

/** The pane's narrowest: the article column with the pane's inset around it. */
export const PANE_MIN = ARTICLE_COLUMN + 2 * PANE_INSET;

/** Everything that is neither region: both edges of the ground and the divider. */
const CHROME = 2 * GROUND_EDGE + DIVIDER_WIDTH;

/** The narrowest window both regions fit in at their minimums. Below it the sidebar folds away. */
export const FOLD_BELOW = CHROME + SIDEBAR_MIN + PANE_MIN;

/**
 * The divider between the sidebar and the pane: where its width is remembered, the property the
 * sidebar reads, and the range a drag may take it through. The fallback is the width a first
 * visit sees, and the one the server renders. See spec/architecture/local.md.
 */
export const SIDEBAR: Divider = {
	key: 'cms.sidebar.width',
	property: '--sidebar-width',
	span: { min: SIDEBAR_MIN, max: 28, fallback: 15 },
};

/**
 * Whether the writer folded the sidebar, kept beside its width in the `reader` record so a reload
 * opens it the way it was left. Only the writer's choice is kept: a window too narrow to dock it
 * folds it anyway and says nothing about what they want once the window is wide again.
 */
export const FOLDED_KEY = 'cms.sidebar.folded';

/** The attribute on the root that says the writer folded it, set before the first frame. */
export const FOLDED_ATTRIBUTE = 'data-sidebar-folded';

/**
 * The script that marks the root before the first frame when the sidebar was left folded, as a
 * string to inline in the document head -- for the reason `dividerScript` gives, which is also why
 * it reads the record itself. `sidebar.test.ts` holds it to what `reader` stores.
 */
export function foldedScript(): string {
	return (
		`(function(){try{var r=localStorage.getItem("state");if(!r)return;` +
		`if(JSON.parse(r)[${JSON.stringify(FOLDED_KEY)}]===true)` +
		`document.documentElement.setAttribute(${JSON.stringify(FOLDED_ATTRIBUTE)},"")}catch(e){}})()`
	);
}

/** The sidebar and the divider gone, within `scope`. */
function folded(scope: string): string {
	return `${scope} [data-sidebar], ${scope} [data-divider] { display: none; }`;
}

/**
 * The rules that place the sidebar, built from the numbers above: a media query cannot read a
 * custom property, and the fold is a sum of four of them. Every rule keys off a state attribute on
 * the ground, which no class can stand in for -- the escape hatch by
 * spec/architecture/css/layers.md, "What each layer owns, by name". Unlayered on purpose: it
 * decides `display` and has to outrank the utilities on the same elements.
 */
export function sidebarStyles(): string {
	const { min, max, fallback } = SIDEBAR.span;
	const width = `var(${SIDEBAR.property}, ${fallback}rem)`;
	return [
		// Docked: the remembered width, never below the minimum nor so wide the pane falls below its
		// own.
		`[data-sidebar] { width: clamp(${min}rem, ${width}, calc(100vw - ${CHROME + PANE_MIN}rem)); }`,
		// Folded, by a narrow window or by the writer: sidebar and divider gone, the pane full width.
		`@media (max-width: ${FOLD_BELOW}rem) { ${folded('[data-ground]')} }`,
		folded('[data-ground][data-collapsed]'),
		folded(`[${FOLDED_ATTRIBUTE}]`),
		// Peeking: lifted over the pane at the left, at the remembered width.
		`[data-ground][data-peek] [data-sidebar] { display: flex; position: fixed; z-index: 30;` +
			` top: ${GROUND_EDGE}rem; bottom: ${GROUND_EDGE}rem; left: ${GROUND_EDGE}rem;` +
			` width: clamp(${min}rem, ${width}, min(${max}rem, calc(100vw - ${2 * GROUND_EDGE}rem)));` +
			` border-radius: 0.75rem; background-color: var(--color-paper-hover);` +
			` box-shadow: 0 0.5rem 2rem oklch(0 0 0 / 0.18), 0 0 0 1px var(--color-border); }`,
	].join('\n');
}

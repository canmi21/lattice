import type { MermaidConfig, RenderResult } from 'mermaid';
import type { Theme } from '@canmi/theme';

type Mermaid = (typeof import('mermaid'))['default'];

/** One diagram drawn in both themes, so a toggle is an assignment rather than a render. */
export type Drawings = Record<Theme, string>;

const THEMES: readonly Theme[] = ['light', 'dark'];

let modulePromise: Promise<Mermaid> | undefined;
let diagramId = 0;
/**
 * `initialize` is global, so two diagrams cannot be mid-configuration at once -- and every
 * diagram now configures twice. Renders go through here one at a time.
 */
let pending: Promise<unknown> = Promise.resolve();

function color(style: CSSStyleDeclaration, name: string): string {
	const value = style.getPropertyValue(name).trim();
	if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) {
		throw new TypeError(
			`${name} must be one three- or six-digit hex colour, got ${value || 'nothing'}`,
		);
	}
	return value.length === 4
		? `#${Array.from(value.slice(1), (digit) => digit.repeat(2)).join('')}`
		: value;
}

/** Two decimals is under half a device pixel at the sizes a diagram is drawn at. */
function trim(value: number): string {
	return value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * One polygon's outline with every corner cut back and bridged by a quadratic.
 *
 * Undefined when the points cannot be read, so the caller leaves the shape exactly as Mermaid
 * drew it rather than emitting a path built from half of them.
 */
function roundedOutline(points: string, radius: number): string | undefined {
	const corners = points
		.trim()
		.split(/\s+/)
		.map((pair) => pair.split(',').map(Number));
	if (corners.length < 3) return undefined;
	if (corners.some((pair) => pair.length !== 2 || pair.some((n) => !Number.isFinite(n)))) {
		return undefined;
	}

	let outline = '';
	for (const [index, corner] of corners.entries()) {
		const [x, y] = corner as [number, number];
		const [px, py] = corners[(index - 1 + corners.length) % corners.length] as [number, number];
		const [nx, ny] = corners[(index + 1) % corners.length] as [number, number];
		const back = Math.hypot(x - px, y - py);
		const forward = Math.hypot(nx - x, ny - y);
		if (back === 0 || forward === 0) return undefined;
		// Never take more than half an edge, so a short one blunts rather than crossing into the
		// cut its neighbour is making from the other end.
		const from = Math.min(radius, back / 2) / back;
		const to = Math.min(radius, forward / 2) / forward;
		outline += index === 0 ? 'M' : 'L';
		outline += `${trim(x + (px - x) * from)},${trim(y + (py - y) * from)}`;
		outline += `Q${trim(x)},${trim(y)} ${trim(x + (nx - x) * to)},${trim(y + (ny - y) * to)}`;
	}
	return `${outline}Z`;
}

/**
 * The same corner the node boxes take from CSS, given to the shapes that cannot take it there.
 *
 * Mermaid draws a decision as a `polygon`, and a polygon has no radius to set -- the only CSS
 * lever is a round line join, which blunts nothing at the hairline this drawing is stroked at.
 * So the points become a path once, while the drawing is being cached, and the swap path stays
 * free. Only the polygon tags are rewritten; every other byte Mermaid wrote is left alone.
 */
function roundDecisions(svg: string, radius: number): string {
	// `NaN <= 0` is false, so an unreadable corner has to be refused by name or every coordinate
	// below becomes NaN and the drawing disappears without an error.
	if (!Number.isFinite(radius) || radius <= 0) return svg;
	return svg.replace(/<polygon\b([^>]*)>(?:<\/polygon>)?/g, (whole, attributes: string) => {
		const points = /\bpoints="([^"]*)"/.exec(attributes);
		const outline = points && roundedOutline(points[1] ?? '', radius);
		if (!points || !outline) return whole;
		return `<path${attributes.replace(points[0], `d="${outline}"`)}></path>`;
	});
}

function configuration(root: HTMLElement, theme: Theme): MermaidConfig {
	const style = getComputedStyle(root);
	// Named rather than switched by an ancestor, so the theme that is not on screen is readable.
	const of = (name: string) => color(style, `--mermaid-${theme}-${name}`);
	const page = of('page');
	const paper = of('paper');
	const hover = of('paper-hover');
	const border = of('border');
	const strongBorder = of('border-strong');
	const text = of('text');
	const softText = of('text-soft');
	const strongText = of('text-strong');
	const ink = of('ink');
	const accent = of('accent');
	const darkMode = theme === 'dark';

	return {
		startOnLoad: false,
		securityLevel: 'strict',
		suppressErrorRendering: true,
		htmlLabels: false,
		theme: 'base',
		fontFamily: style.fontFamily,
		maxTextSize: 50_000,
		maxEdges: 500,
		secure: [
			'secure',
			'securityLevel',
			'startOnLoad',
			'maxTextSize',
			'maxEdges',
			'suppressErrorRendering',
			'htmlLabels',
			'theme',
			'themeCSS',
			'themeVariables',
			'fontFamily',
		],
		themeVariables: {
			darkMode,
			background: paper,
			fontFamily: style.fontFamily,
			// Mermaid's theme API documents this value in pixels and uses it while measuring labels.
			fontSize: '14px',
			primaryColor: hover,
			primaryTextColor: text,
			primaryBorderColor: strongBorder,
			secondaryColor: hover,
			secondaryTextColor: text,
			secondaryBorderColor: border,
			tertiaryColor: page,
			tertiaryTextColor: softText,
			tertiaryBorderColor: border,
			lineColor: strongBorder,
			textColor: text,
			mainBkg: hover,
			nodeBorder: strongBorder,
			clusterBkg: hover,
			clusterBorder: border,
			edgeLabelBackground: paper,
			noteBkgColor: hover,
			noteTextColor: text,
			noteBorderColor: strongBorder,
			actorBkg: hover,
			actorBorder: strongBorder,
			actorTextColor: text,
			actorLineColor: border,
			signalColor: strongBorder,
			signalTextColor: text,
			labelBoxBkgColor: hover,
			labelBoxBorderColor: border,
			labelTextColor: text,
			activationBkgColor: hover,
			activationBorderColor: strongBorder,
			quadrant1Fill: paper,
			quadrant2Fill: hover,
			quadrant3Fill: page,
			quadrant4Fill: hover,
			quadrant1TextFill: softText,
			quadrant2TextFill: softText,
			quadrant3TextFill: softText,
			quadrant4TextFill: softText,
			quadrantPointFill: ink,
			quadrantPointTextFill: strongText,
			quadrantXAxisTextFill: softText,
			quadrantYAxisTextFill: softText,
			quadrantInternalBorderStrokeFill: border,
			quadrantExternalBorderStrokeFill: strongBorder,
			quadrantTitleFill: strongText,
			git0: ink,
			git1: accent,
			gitBranchLabel0: paper,
			gitBranchLabel1: strongText,
		},
	};
}

async function draw(source: string, root: HTMLElement): Promise<Drawings> {
	modulePromise ??= import('mermaid').then(({ default: mermaid }) => mermaid);
	const mermaid = await modulePromise;
	const drawings = {} as Drawings;
	// One home for the corner, read from the same stylesheet the node boxes take theirs from.
	const corner = Number.parseFloat(getComputedStyle(root).getPropertyValue('--mermaid-corner'));
	for (const theme of THEMES) {
		// Sequential on purpose, which is what the `no-await-in-loop` warning is about: the
		// configuration `initialize` writes is global, so a second render started before the
		// first finished would draw in whichever theme was configured last. `initialize` merges,
		// and this adapter passes every value it owns on each call, so repeating it leaves none
		// of the previous theme behind. Stated rather than suppressed; see spec/lint-format.md.
		mermaid.initialize(configuration(root, theme));
		diagramId += 1;
		const result: RenderResult = await mermaid.render(`mermaid-diagram-${diagramId}`, source);
		drawings[theme] = roundDecisions(result.svg, corner);
	}
	return drawings;
}

/**
 * Draw one diagram in both themes.
 *
 * Mermaid writes the palette into the SVG it returns, so a repainted token reaches a diagram
 * already on screen only through another render -- and a render is asynchronous, which is a frame
 * or two after the rest of the page has turned. Drawing both while the loading surface is still up
 * makes the toggle an assignment. See spec/styling/blocks.md, "A diagram is drawn in both themes
 * at once, because the palette is inside the SVG".
 */
export async function renderMermaid(source: string, root: HTMLElement): Promise<Drawings> {
	const run = pending.then(() => draw(source, root));
	pending = run.catch(() => undefined);
	return run;
}

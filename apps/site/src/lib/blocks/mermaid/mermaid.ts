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
	for (const theme of THEMES) {
		// Sequential on purpose, which is what the `no-await-in-loop` warning is about: the
		// configuration `initialize` writes is global, so a second render started before the
		// first finished would draw in whichever theme was configured last. `initialize` merges,
		// and this adapter passes every value it owns on each call, so repeating it leaves none
		// of the previous theme behind. Stated rather than suppressed; see spec/lint-format.md.
		mermaid.initialize(configuration(root, theme));
		diagramId += 1;
		const result: RenderResult = await mermaid.render(`mermaid-diagram-${diagramId}`, source);
		drawings[theme] = result.svg;
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

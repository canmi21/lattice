import type { MermaidConfig, RenderResult } from 'mermaid';
import type { Theme } from '@canmi/theme';

type Mermaid = (typeof import('mermaid'))['default'];

let modulePromise: Promise<Mermaid> | undefined;
let configuredTheme: Theme | undefined;
let diagramId = 0;

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
	const page = color(style, '--mermaid-page');
	const paper = color(style, '--mermaid-paper');
	const hover = color(style, '--mermaid-paper-hover');
	const border = color(style, '--mermaid-border');
	const strongBorder = color(style, '--mermaid-border-strong');
	const text = color(style, '--mermaid-text');
	const softText = color(style, '--mermaid-text-soft');
	const strongText = color(style, '--mermaid-text-strong');
	const ink = color(style, '--mermaid-ink');
	const accent = color(style, '--mermaid-accent');
	// Taken from the caller rather than read back off an ancestor, so the value the component
	// re-renders on and the value baked into the SVG cannot be two different answers.
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

/**
 * Configure once per theme, rather than once.
 *
 * Mermaid writes the palette into the SVG it returns, so a repainted token reaches a diagram that
 * is already drawn only if it is drawn again -- see spec/styling/blocks.md, "A theme change
 * redraws a diagram, because the palette is inside the SVG". `initialize` merges, and this
 * adapter passes every value it owns on each call, so repeating it leaves none behind.
 */
async function load(root: HTMLElement, theme: Theme): Promise<Mermaid> {
	modulePromise ??= import('mermaid').then(({ default: mermaid }) => mermaid);
	const mermaid = await modulePromise;
	if (configuredTheme !== theme) {
		mermaid.initialize(configuration(root, theme));
		configuredTheme = theme;
	}
	return mermaid;
}

export async function renderMermaid(
	source: string,
	root: HTMLElement,
	theme: Theme,
): Promise<RenderResult> {
	const mermaid = await load(root, theme);
	diagramId += 1;
	return mermaid.render(`mermaid-diagram-${diagramId}`, source);
}

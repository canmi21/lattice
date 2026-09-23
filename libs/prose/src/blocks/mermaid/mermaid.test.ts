import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const initialize = vi.fn();
const render = vi.fn(async (id: string, source: string) => ({
	// A decision's diamond rides along, because every drawing passes through the corner cutter.
	svg: `<svg id="${id}"><text>${source}</text><polygon points="10,0 20,10 10,20 0,10" class="label-container"></polygon></svg>`,
}));

vi.mock('mermaid', () => ({ default: { initialize, render } }));

const palette: Record<string, string> = {
	// Production CSS minification shortens repeatable hex pairs; the reader must restore the
	// six-digit values required by Mermaid rather than depending on source spelling.
	'--mermaid-corner': '8px',
	'--mermaid-light-page': '#111',
	'--mermaid-light-paper': '#fff',
	'--mermaid-light-paper-hover': '#f2f2f2',
	'--mermaid-light-border': '#e3e3e3',
	'--mermaid-light-border-strong': '#d3d3d3',
	'--mermaid-light-text': '#161616',
	'--mermaid-light-text-soft': '#696969',
	'--mermaid-light-text-strong': '#0d0d0d',
	'--mermaid-light-ink': '#1f1f1f',
	'--mermaid-light-accent': '#2b7fff',
	'--mermaid-dark-page': '#222',
	'--mermaid-dark-paper': '#0d0d0d',
	'--mermaid-dark-paper-hover': '#191919',
	'--mermaid-dark-border': '#1f1f1f',
	'--mermaid-dark-border-strong': '#2b2b2b',
	'--mermaid-dark-text': '#d7d7d7',
	'--mermaid-dark-text-soft': '#7c7c7c',
	'--mermaid-dark-text-strong': '#eaeaea',
	'--mermaid-dark-ink': '#dbdbdb',
	'--mermaid-dark-accent': '#2b7fff',
};

beforeEach(() => {
	vi.stubGlobal('getComputedStyle', () => ({
		fontFamily: 'Inter, sans-serif',
		getPropertyValue: (name: string) => palette[name] ?? '',
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

it('initializes strict rendering from the colocated hex palette, once per theme', async () => {
	const { renderMermaid } = await import('./mermaid');
	const root = {} as unknown as HTMLElement;
	const drawings = await renderMermaid('flowchart LR\nA --> B', root);

	// Twice, because a toggle has to be an assignment rather than a render: both drawings are
	// made while the loading surface is still up. See spec/styling/blocks.md.
	expect(initialize).toHaveBeenCalledTimes(2);
	expect(initialize).toHaveBeenNthCalledWith(
		1,
		expect.objectContaining({
			startOnLoad: false,
			securityLevel: 'strict',
			htmlLabels: false,
			theme: 'base',
			themeVariables: expect.objectContaining({
				darkMode: false,
				background: '#ffffff',
				tertiaryColor: '#111111',
				primaryColor: '#f2f2f2',
				lineColor: '#d3d3d3',
				textColor: '#161616',
			}),
		}),
	);
	expect(initialize).toHaveBeenNthCalledWith(
		2,
		expect.objectContaining({
			themeVariables: expect.objectContaining({
				darkMode: true,
				background: '#0d0d0d',
				tertiaryColor: '#222222',
				primaryColor: '#191919',
				lineColor: '#2b2b2b',
				textColor: '#d7d7d7',
			}),
		}),
	);
	expect(render).toHaveBeenCalledWith('mermaid-diagram-1', 'flowchart LR\nA --> B');
	expect(drawings.light).toContain('mermaid-diagram-1');
	expect(drawings.dark).toContain('mermaid-diagram-2');
});

it('gives a decision the corner a node box takes from CSS', async () => {
	const { renderMermaid } = await import('./mermaid');
	const drawings = await renderMermaid('flowchart LR\nA --> B', {} as unknown as HTMLElement);

	// A polygon has no radius to set, so its points become a path while the drawing is cached
	// rather than on the swap. Every other attribute Mermaid wrote survives the rewrite.
	for (const drawing of [drawings.light, drawings.dark]) {
		expect(drawing).not.toContain('<polygon');
		expect(drawing).toContain('class="label-container"');
		expect(drawing).toMatch(/<path d="M[\d.,\sQL-]+Z"/);
	}
});

it('leaves a shape exactly as it was drawn when its points cannot be read', async () => {
	const { renderMermaid } = await import('./mermaid');
	render.mockResolvedValue({ svg: '<svg><polygon points="10,0 nonsense"></polygon></svg>' });

	const drawings = await renderMermaid('flowchart LR\nA --> B', {} as unknown as HTMLElement);

	// Half a shape is worse than the shape, so the cutter declines rather than guessing.
	expect(drawings.light).toContain('<polygon points="10,0 nonsense">');
});

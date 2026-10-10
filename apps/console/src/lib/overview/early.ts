/**
 * The early script's tag: ./early-draw.js's own text, its comments and exports taken off, called
 * with what the server knows. The text is the file's, not a compiled function's, so the server's
 * tag and the browser's are one string and hydration keeps it. See spec/architecture/console.md,
 * "Drawn before the first paint".
 */
import type { fitted } from './early-draw.js';

/** What the server writes into the script: the counts, how each draws, and the letters. */
export interface Early {
	/** The counts the span may be drawn in, finest first. */
	counts: number[];
	bounds: Parameters<typeof fitted>[2];
	/** A slot's three layers' classes, outermost first. */
	layers: [string, string, string];
	/** Each verdict's class, mildest first, and each shade's opacity, palest first. */
	paints: string[];
	opacities: string[];
	/** The letters a slot is written in; see ./judge.ts. */
	alphabet: string;
	/** By count, then by row, the row's slots as letters. */
	rows: string[][];
	/** Milliseconds it may take before it leaves the rows empty. */
	budget: number;
}

/** The file's text as written, which Vite reads in where the page is built. */
const [source = ''] = Object.values(
	import.meta.glob<string>('./early-draw.js', { query: '?raw', import: 'default', eager: true }),
);
const BODY = source
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/^\/\/.*$/gm, '')
	.replaceAll('export function', 'function')
	.replace(/\n\s*\n/g, '\n');

/** The script that draws the rows, its input written into it, safe inside the page's markup. */
export function earlyTag(input: Early): string {
	const json = JSON.stringify(input).replaceAll('<', '\\u003c');
	return `<script>(function(){${BODY}drawEarly(${json})})()</script>`;
}

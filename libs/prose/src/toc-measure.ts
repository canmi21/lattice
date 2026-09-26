/**
 * The table of contents' measurements: the root's size for mixing rem geometry with the DOM, where
 * the indicator stands for a rail in any state between collapsed and open, and the rail's offset
 * as the article ends. Pure functions and one action; the state they are asked about is
 * `toc.svelte`'s.
 */
import { DEFAULT_PIXELS_PER_REM, remFromMeasuredPixels } from '@canmi/units';
import { railEndOffset } from './rail';

/** The resting height of a collapsed bar, and of the open indicator, in default-root pixels. */
export const BAR_HEIGHT = 4;
export const INDICATOR_HEIGHT = 12;

export type IndicatorGeometry = { y: number; height: number };

// Geometry is authored against the default root and written as rem. Calculations that mix it
// with DOM measurements scale it to the live root first.
export const rootFontPixels = () =>
	Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || DEFAULT_PIXELS_PER_REM;
export const toScaledPixels = (value: number, root: number) =>
	(value / DEFAULT_PIXELS_PER_REM) * root;

/**
 * Where the indicator goes, for a rail opened by `opened` with bars still `bar` tall.
 *
 * Arithmetic rather than measured, because the rail is in motion exactly when this is asked:
 * a button reports 28px mid-flight and 24px once it settles. The two resting layouts are this
 * function's endpoints and every frame of the reveal lies between them. See
 * spec/styling/rail.md, "The active mark opens with the column, not to where the column is
 * going".
 */
export function placeIndicator(
	aside: HTMLElement | undefined,
	lines: number[] | undefined,
	index: number,
	bar: number,
	opened: number,
): IndicatorGeometry | undefined {
	const label = aside?.querySelector<HTMLElement>('[data-toc-text]');
	const button = aside?.querySelector<HTMLElement>('[data-toc-button]');
	if (!lines || !label || !button || index < 0 || index >= lines.length) return undefined;

	const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
	const style = getComputedStyle(button);
	const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
	if (!Number.isFinite(lineHeight) || !Number.isFinite(padding)) return undefined;

	// Every entry above this one contributes the same padding and the same bar, and its own
	// label's share of whatever has arrived -- so their labels are counted in lines rather
	// than one entry at a time.
	let above = 0;
	for (let entry = 0; entry < index; entry += 1) above += lines[entry] ?? 1;
	const top = button.offsetTop + index * (padding + bar) + lineHeight * opened * above;
	const tall = padding + bar + lineHeight * opened * (lines[index] ?? 1);

	// Collapsed, the entry is a bar and the mark on it is that bar; open, it is the mark's
	// own length, plus a line for a label that takes two.
	const open =
		toScaledPixels(INDICATOR_HEIGHT, rootFontPixels()) + lineHeight * ((lines[index] ?? 1) - 1);
	const height = bar * (1 - opened) + open * opened;
	return { y: top + tall / 2 - height / 2, height };
}

/** Keep the rail clear of the article's end, by an offset written as a custom property. */
export function followArticleEnd(node: HTMLElement) {
	const article = document.querySelector<HTMLElement>('article');
	let frame = 0;
	let rootPixels = rootFontPixels();
	let navHeight = node.getBoundingClientRect().height;
	let articleTop = 0;
	let articleEnd = Number.POSITIVE_INFINITY;
	let renderedOffset = '';
	let destroyed = false;
	let measureNext = false;

	const position = () => {
		const offset = railEndOffset(window.innerHeight, navHeight, articleEnd - window.scrollY);
		const rendered = remFromMeasuredPixels(offset, rootPixels);
		if (rendered === renderedOffset) return;
		renderedOffset = rendered;
		node.style.setProperty('--toc-end-offset', rendered);
	};

	const calibrate = () => {
		rootPixels = rootFontPixels();
		navHeight = node.getBoundingClientRect().height;
		if (article) {
			const rect = article.getBoundingClientRect();
			articleTop = rect.top + window.scrollY;
			articleEnd = rect.bottom + window.scrollY;
		}
		position();
	};

	const schedule = (measure = false) => {
		measureNext ||= measure;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			if (measureNext) {
				measureNext = false;
				calibrate();
			} else {
				position();
			}
		});
	};

	const resize = new ResizeObserver((observations) => {
		for (const entry of observations) {
			const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
			if (entry.target === node) navHeight = height;
			if (entry.target === article) articleEnd = articleTop + height;
		}
		position();
	});
	resize.observe(node);
	if (article) resize.observe(article);
	const onScroll = () => schedule();
	const onResize = () => schedule(true);
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onResize);
	calibrate();
	document.fonts.ready.then(() => {
		if (!destroyed) calibrate();
	});

	return {
		destroy() {
			destroyed = true;
			cancelAnimationFrame(frame);
			resize.disconnect();
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
		},
	};
}

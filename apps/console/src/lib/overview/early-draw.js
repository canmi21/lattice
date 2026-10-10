// @ts-check
/**
 * The timeline's slots drawn by the page as it is read, before the first paint, from the column's
 * width: plain JavaScript, so the page carries this file's own text, the same from the server as
 * in the browser, which a function compiled once for each cannot promise. The component imports
 * it as a module; ./early.ts writes its text out. See spec/architecture/console.md, "Drawn before
 * the first paint".
 */

/** @typedef {{ min: number, max: number }} Range */
/** @typedef {{ of: number, slot: number, gap: number }} Fitted */

/**
 * The slots a span is drawn in across `width` pixels, of its `counts` finest first: the finest
 * whose slots, at their narrowest and closest, still fit, then a width and a gap within their
 * bounds that fill it -- the slots widening first, and the gap after them. Where even the coarsest
 * does not fit at its narrowest, that count, overflowing; where the finest stops short at its
 * widest, that count, short of the edge.
 * @param {readonly number[]} counts
 * @param {number} width
 * @param {{ slot: Range, gap: Range }} bounds
 * @returns {Fitted}
 */
export function fitted(counts, width, bounds) {
	const { slot: least, gap: apart } = bounds;
	const of =
		counts.find((count) => count * least.min + (count - 1) * apart.min <= width) ??
		counts.at(-1) ??
		1;
	// The slots as wide as the row allows at the closest gap, then the gap as wide as what is left.
	const slot = Math.max(least.min, Math.min(least.max, (width - (of - 1) * apart.min) / of));
	const gap = Math.max(apart.min, Math.min(apart.max, (width - of * slot) / Math.max(1, of - 1)));
	return { of, slot, gap };
}


/**
 * Every row waiting in the grid just before the running script, drawn: the column measured once,
 * the count its width fits picked, then each row's slots written in from its letters. Past its
 * budget it empties what it drew and leaves the rows to the component.
 * @param {import('./early.ts').Early} input
 */
export function drawEarly(input) {
	const start = performance.now();
	const grid = document.currentScript?.previousElementSibling;
	/** @type {HTMLElement[]} */
	const rows = grid
		? [...grid.querySelectorAll('[data-early]')].map((one) => /** @type {HTMLElement} */ (one))
		: [];
	const column = rows[0]?.parentElement;
	if (!column) return;
	const { of, slot, gap } = fitted(input.counts, column.clientWidth, input.bounds);
	const letters = input.rows[input.counts.indexOf(of)];
	if (!letters) return;
	const [outer, ring, fill] = input.layers;
	const shades = input.opacities.length;
	const open = `<span class="${outer}" style="width:${slot + gap}px;padding-inline:${gap / 2}px"><span class="${ring}"><span class="${fill} `;
	for (const [at, each] of rows.entries()) {
		let row = '';
		for (const letter of letters[at] ?? '') {
			const index = Math.max(0, input.alphabet.indexOf(letter));
			const verdict = Math.floor(index / shades);
			const opacity = verdict === 0 ? '' : ` style="opacity:${input.opacities[index % shades]}"`;
			row += `${open}${input.paints[verdict]}"${opacity}></span></span></span>`;
		}
		each.style.marginInline = `${-gap / 2}px`;
		each.innerHTML = row;
		if (performance.now() - start > input.budget) {
			for (const drawn of rows) drawn.textContent = '';
			return;
		}
	}
	performance.mark('timeline drawn early', { detail: { of, took: performance.now() - start } });
}

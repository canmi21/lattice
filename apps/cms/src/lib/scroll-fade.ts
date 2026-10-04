/**
 * A scrolling list that fades at an edge only where something is cut off there.
 *
 * At rest at the top nothing is hidden above, so the top edge is sharp; scroll down and the top
 * fades in, because rows now pass out of view under it. The bottom fades while there is more below
 * and goes sharp at the end. A fade on an edge with nothing past it would dim the first or last row
 * for no reason, and hide that the list had ended.
 *
 * Drawn with a mask on the scroller itself, so what fades is the rows and not a painted veil that
 * has to match whatever ground lies behind. Re-read on scroll and whenever the list or its box
 * changes size -- a folder opening changes where the end is as surely as a scroll does.
 */

/** How far into the list an edge's fade reaches. */
const FADE = '1.5rem';

export function scrollFade(node: HTMLElement) {
	function update() {
		const above = node.scrollTop > 0.5;
		const below = node.scrollTop + node.clientHeight < node.scrollHeight - 0.5;
		if (!above && !below) {
			node.style.removeProperty('mask-image');
			return;
		}
		const top = above ? `transparent 0, black ${FADE}` : 'black 0';
		const bottom = below ? `black calc(100% - ${FADE}), transparent 100%` : 'black 100%';
		node.style.maskImage = `linear-gradient(to bottom, ${top}, ${bottom})`;
	}

	const resized = new ResizeObserver(update);
	resized.observe(node);
	for (const child of node.children) resized.observe(child);
	node.addEventListener('scroll', update, { passive: true });
	update();

	return {
		destroy() {
			resized.disconnect();
			node.removeEventListener('scroll', update);
		},
	};
}

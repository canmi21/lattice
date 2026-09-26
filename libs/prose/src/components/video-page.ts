/**
 * What web fullscreen does to the page behind it: scroll swallowed, not redirected -- see
 * spec/architecture/video/player.md, "Filling the window is a page mode, not a media one". Three
 * things hold it: `overflow: hidden`, the scrollbar gutter paid back as padding, and
 * `touchmove` cancelled except over the chrome, which needs it to drag the scrubber and volume.
 *
 * Held while the returned function is not called; calling it gives the page back, at `restore`,
 * where the article was before the frame left the flow. `leave` is asked for when Escape is
 * pressed.
 */
export function holdPage(leave: () => void, restore: () => number): () => void {
	const { body, documentElement: root } = document;
	const gutter = window.innerWidth - root.clientWidth;
	const overflow = body.style.overflow;
	const padding = body.style.paddingInlineEnd;
	body.style.overflow = 'hidden';
	if (gutter > 0) body.style.paddingInlineEnd = `${gutter}px`;

	const onKey = (event: KeyboardEvent) => {
		if (event.key === 'Escape') leave();
	};
	const swallow = (event: TouchEvent) => {
		if ((event.target as Element | null)?.closest('.player-chrome')) return;
		event.preventDefault();
	};
	window.addEventListener('keydown', onKey);
	document.addEventListener('touchmove', swallow, { passive: false });

	return () => {
		body.style.overflow = overflow;
		body.style.paddingInlineEnd = padding;
		window.removeEventListener('keydown', onKey);
		document.removeEventListener('touchmove', swallow);
		window.scrollTo({ top: restore(), behavior: 'instant' });
	};
}

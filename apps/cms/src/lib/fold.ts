/**
 * A list that opens and closes by its height, the way the site's footnotes fold.
 *
 * The content stays in the document either way and the box around it clips; opening or closing
 * animates the box between two measured heights with the site's disclosure (`animateHeight` in
 * @canmi/behavior/collapse, on the press timing from @canmi/motion), and hands the height back when
 * it lands -- `auto` when open, so it keeps following its content, and zero when closed. So a
 * sidebar whose folders open and close changes height as a movement rather than a jump.
 *
 * A closed list is `inert`: what cannot be seen cannot be tabbed into either. The element carries
 * its own `overflow-hidden`; this only ever writes its height.
 */
import { animateHeight, type AnimationControl } from '@canmi/behavior/collapse';

export function foldHeight(node: HTMLElement, open: boolean) {
	let motion: AnimationControl | undefined;

	function rest(opened: boolean) {
		node.style.height = opened ? '' : '0px';
		node.inert = !opened;
	}

	rest(open);

	return {
		update(opened: boolean) {
			motion?.stop();
			node.inert = !opened;
			const target = opened ? node.scrollHeight : 0;
			motion = animateHeight(node, target, (finished) => {
				if (finished !== undefined && finished !== motion) return;
				motion = undefined;
				rest(opened);
			});
		},
		destroy() {
			motion?.stop();
		},
	};
}

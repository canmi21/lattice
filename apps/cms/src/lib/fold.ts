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
 *
 * Given `{ open, still: true }` it goes to where it is told without moving: a folder put back the
 * way a reload found it was not opened or closed by anybody.
 */
import { animateHeight, type AnimationControl } from '@canmi/behavior/collapse';

type Fold = boolean | { open: boolean; still?: boolean };

export function foldHeight(node: HTMLElement, fold: Fold) {
	let motion: AnimationControl | undefined;

	function rest(opened: boolean) {
		node.style.height = opened ? '' : '0px';
		node.inert = !opened;
	}

	rest(typeof fold === 'boolean' ? fold : fold.open);

	return {
		update(next: Fold) {
			const opened = typeof next === 'boolean' ? next : next.open;
			motion?.stop();
			if (typeof next !== 'boolean' && next.still) {
				motion = undefined;
				rest(opened);
				return;
			}
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

/**
 * Where a reader can be pointed inside an article: every block a person sees as a thing of its
 * own takes an anchor named for what it is and numbered among its kind, in the order the article
 * has them -- `#diagram-2` is the article's second diagram. Worked out from the blocks wherever
 * they are, never stored. See spec/architecture/anchors.md.
 */
import type { Block } from './types';

/** The name each anchored block's anchors take: what a reader sees, not how it is drawn. */
export const BLOCK_ANCHORS = {
	code: 'code',
	image: 'image',
	video: 'video',
	svgCanvas: 'diagram',
	mermaid: 'diagram',
	quadrant: 'chart',
	tokei: 'stats',
	cargo: 'crate',
	github: 'repo',
	twitter: 'tweet',
	linkcard: 'link',
	article: 'card',
} as const satisfies Partial<Record<Block['type'], string>>;

/** Every name an anchor takes, once each. */
export const ANCHOR_KINDS = [...new Set(Object.values(BLOCK_ANCHORS))];

const ANCHOR = new RegExp(`^(${ANCHOR_KINDS.join('|')})-([1-9]\\d*)$`);

/** A block anchor's kind and number, if `id` is one: `diagram-2`, not `code-review`. */
export function parseBlockAnchor(id: string): { kind: string; number: number } | undefined {
	const found = ANCHOR.exec(id);
	return found ? { kind: found[1]!, number: Number(found[2]) } : undefined;
}

/** Whether a heading's id would take a block anchor's place, which it may not. */
export function isBlockAnchor(id: string): boolean {
	return ANCHOR.test(id);
}

/** Each block's anchor, in order, or `undefined` for a block that takes none. */
export function blockAnchors(blocks: readonly Pick<Block, 'type'>[]): (string | undefined)[] {
	const counts = new Map<string, number>();
	return blocks.map(({ type }) => {
		const kind = (BLOCK_ANCHORS as Partial<Record<string, string>>)[type];
		if (!kind) return undefined;
		const number = (counts.get(kind) ?? 0) + 1;
		counts.set(kind, number);
		return `${kind}-${number}`;
	});
}

/**
 * Where a block anchor that names nothing lands instead: the same kind's nearest number, the lower
 * one on a tie, among `present`. Nothing when `id` is no block anchor or none of its kind exists.
 */
export function nearestBlockAnchor(id: string, present: readonly string[]): string | undefined {
	const asked = parseBlockAnchor(id);
	if (!asked) return undefined;
	let best: { id: string; distance: number; number: number } | undefined;
	for (const candidate of present) {
		const found = parseBlockAnchor(candidate);
		if (!found || found.kind !== asked.kind) continue;
		const distance = Math.abs(found.number - asked.number);
		if (
			!best ||
			distance < best.distance ||
			(distance === best.distance && found.number < best.number)
		) {
			best = { id: candidate, distance, number: found.number };
		}
	}
	return best?.id;
}

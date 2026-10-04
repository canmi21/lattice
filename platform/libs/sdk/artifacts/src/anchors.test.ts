import { describe, expect, it } from 'vitest';
import { blockAnchors, isBlockAnchor, nearestBlockAnchor, parseBlockAnchor } from './anchors';

describe('blockAnchors', () => {
	it('numbers each kind on its own, in order, and leaves prose and headings out', () => {
		const anchors = blockAnchors([
			{ type: 'prose' },
			{ type: 'svgCanvas' },
			{ type: 'code' },
			{ type: 'mermaid' },
			{ type: 'heading' },
			{ type: 'twitter' },
			{ type: 'placeholder' },
		]);
		expect(anchors).toEqual([
			undefined,
			'diagram-1',
			'code-1',
			'diagram-2',
			undefined,
			'tweet-1',
			undefined,
		]);
	});
});

describe('which ids are taken', () => {
	it('reserves a kind and a number, and nothing else', () => {
		expect(isBlockAnchor('diagram-3')).toBe(true);
		expect(isBlockAnchor('code-review')).toBe(false);
		expect(isBlockAnchor('code-0')).toBe(false);
		expect(isBlockAnchor('codes-1')).toBe(false);
		expect(parseBlockAnchor('tweet-12')).toEqual({ kind: 'tweet', number: 12 });
	});
});

describe('nearestBlockAnchor', () => {
	const present = ['diagram-1', 'diagram-2', 'code-1', 'diagram-5'];

	it('lands on the nearest of the same kind, the lower on a tie', () => {
		expect(nearestBlockAnchor('diagram-3', present)).toBe('diagram-2');
		expect(nearestBlockAnchor('diagram-9', present)).toBe('diagram-5');
		expect(nearestBlockAnchor('diagram-4', present)).toBe('diagram-5');
	});

	it('lands nowhere for another kind or for a heading', () => {
		expect(nearestBlockAnchor('video-1', present)).toBeUndefined();
		expect(nearestBlockAnchor('preface', present)).toBeUndefined();
	});
});

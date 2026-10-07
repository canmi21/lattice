import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { viewedAs } from '../scope/context.ts';
import Matrix from './matrix.svelte';
import Progress from './progress.svelte';
import type { Cell, NodeMark } from './state.ts';

describe('the progress strip', () => {
	it('fills a running cell as far as its stage, and says every node in words', () => {
		const marks: NodeMark[] = [
			{ node: 'tyo', mark: 'running', stage: 'admitting', placements: 1 },
			{ node: 'nrt', mark: 'succeeded', placements: 2 },
			{ node: 'bru', mark: 'absent', placements: 0 },
			{ node: 'rdu', mark: 'unknown', placements: 0 },
		];
		const { body } = render(Progress, { props: { marks } });
		expect(body).toContain('height: 50%');
		expect(body).toContain(
			'aria-label="Tokyo, Japan (tyo) Admitting, Tokyo, Japan (nrt) Succeeded, Belgium, EU (bru) Not placed, Raleigh, US (rdu) Unknown"',
		);
		expect(body.match(/title="/g)).toHaveLength(4);
	});
});

describe('the matrix', () => {
	it('links a placed cell to its node with its reason, and writes the rest plainly', () => {
		const placement = {
			node: 'tyo' as const,
			app: 'web',
			action: 'deploy',
			outcome: 'failed',
			stage: 'loading',
			detail: 'image digest did not match',
			started_at: '2026-10-05T10:00:00Z',
		};
		const rows: Cell[][] = [
			[
				{ app: 'web', node: 'tyo', mark: 'failed', placement },
				{ app: 'web', node: 'bru', mark: 'absent' },
			],
		];
		const { body } = render(Matrix, { props: { rows, nodes: ['tyo', 'bru'] } });
		expect(body).toContain('href="/nodes/tyo" title="image digest did not match"');
		expect(body).toContain('Failed loading');
		expect(body).toContain('Not placed');
		expect(body).not.toContain('href="/nodes/bru"');
		const scoped = render(Matrix, {
			props: { rows, nodes: ['tyo', 'bru'] },
			context: viewedAs('platform'),
		});
		expect(scoped.body).toContain('href="/infra/nodes/tyo"');
	});
});

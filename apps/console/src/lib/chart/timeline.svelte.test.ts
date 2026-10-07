import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { HOVER, Hover } from './hover.svelte.ts';
import Timeline, { type Track } from './timeline.svelte';

const START = 1_790_000_000;
const stages = [
	{ key: 'download', label: 'Downloaded', color: 'var(--color-series-1)' },
	{ key: 'load', label: 'Loaded', color: 'var(--color-series-2)' },
	{ key: 'start', label: 'Started', color: 'var(--color-series-3)' },
];
const tracks: Track[] = [
	{
		key: 'tokyo',
		label: 'tokyo',
		stages: [
			{ stage: 'download', start: START, end: START + 30 },
			{ stage: 'load', start: START + 30, end: START + 45 },
			{ stage: 'start', start: START + 45, end: START + 50, failed: true },
		],
	},
	{
		key: 'oregon',
		label: 'oregon',
		stages: [{ stage: 'download', start: START + 10 }],
	},
];

describe('timeline on the server', () => {
	it('draws each stage across its span, GAP from the next, in its stage color', () => {
		const { body } = render(Timeline, { props: { tracks, stages, until: START + 100 } });
		// Four segments, and a legend swatch for each of three stages.
		expect(body.match(/background-color: var\(--color-series-\d\)/g)).toHaveLength(4 + 3);
		expect(body).toContain('left: calc(30% + 1px)');
		expect(body).toContain('aria-label="tokyo, Downloaded 30 s, Began');
	});

	it('marks a failure with an icon and a word, and a stage still going as so far', () => {
		const { body } = render(Timeline, { props: { tracks, stages, until: START + 100 } });
		expect(body).toContain('aria-label="Failed"');
		expect(body).toMatch(/Outcome Failed"/);
		// The open stage runs to `until`: 90 seconds from its start.
		expect(body).toContain('Downloaded 1 min 30 s so far');
		expect(body).toMatch(/Outcome Running"/);
	});

	it('draws the moment shared under sync across every row', () => {
		const hover = new Hover();
		hover.at = START + 60;
		const shared = render(Timeline, {
			props: { tracks, stages, since: START, until: START + 100 },
			context: new Map([[HOVER, hover]]),
		});
		const alone = render(Timeline, { props: { tracks, stages, since: START, until: START + 100 } });
		expect(shared.body).toContain('left: 60%');
		expect(alone.body).not.toContain('left: 60%');
	});

	it('says there is nothing when no row has a stage', () => {
		const { body } = render(Timeline, { props: { tracks: [], stages } });
		expect(body).toContain('Nothing to show');
	});
});

import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import CheckCircleIcon from '@tabler/icons-svelte-runes/icons/circle-check';
import XCircleIcon from '@tabler/icons-svelte-runes/icons/circle-x';
import Badge from './badge.svelte';
import PageHeader from './page-header.svelte';
import Segmented, { RANGES } from './segmented.svelte';
import Tabs from './tabs.svelte';

const words = (html: string) => createRawSnippet(() => ({ render: () => `<span>${html}</span>` }));
const stateIcon = (icon: typeof CheckCircleIcon) =>
	/<svg[\s\S]*<\/svg>/.exec(
		render(icon, { props: { size: 14, stroke: 2.5, 'aria-hidden': 'true' } }).body,
	)![0];

describe('badge on the server', () => {
	it('says a state with an icon and a word, never the tone alone', () => {
		const good = render(Badge, { props: { tone: 'good', children: words('Healthy') } }).body;
		expect(good).toContain(stateIcon(CheckCircleIcon));
		expect(good).toContain('Healthy');
		const bad = render(Badge, { props: { tone: 'bad', children: words('Failed') } }).body;
		expect(bad).toContain(stateIcon(XCircleIcon));
	});
});

describe('tabs on the server', () => {
	const tabs = [
		{ key: 'overview', label: 'Overview' },
		{ key: 'logs', label: 'Logs' },
	];

	it('marks the chosen tab where the server draws it, the only one in the tab order', () => {
		const { body } = render(Tabs, { props: { tabs, current: 'logs' } });
		expect(body.match(/role="tab"/g)).toHaveLength(2);
		expect(body).toMatch(/aria-selected="true" tabindex="0"[^>]*>Logs</);
		expect(body).toMatch(/aria-selected="false" tabindex="-1"[^>]*>Overview</);
	});

	it('makes a tab with a page of its own a link', () => {
		const linked = tabs.map((tab) => ({ ...tab, href: `/apps/web/${tab.key}` }));
		const { body } = render(Tabs, { props: { tabs: linked, current: 'overview' } });
		expect(body).toContain('href="/apps/web/logs"');
		expect(body).toContain('aria-current="page"');
	});
});

describe('segmented on the server', () => {
	it('offers the usual time ranges, the chosen one checked', () => {
		const { body } = render(Segmented, {
			props: { options: RANGES, value: '24h', label: 'Time range' },
		});
		for (const range of ['1h', '6h', '24h', '7d', '30d']) expect(body).toContain(`>${range}<`);
		expect(body).toMatch(/aria-checked="true"[^>]*>24h</);
		expect(body.match(/aria-checked="true"/g)).toHaveLength(1);
	});

	it('links each range when the range lives in the query', () => {
		const options = RANGES.map((range) => ({ ...range, href: `?range=${range.key}` }));
		const { body } = render(Segmented, { props: { options, value: '1h', label: 'Time range' } });
		expect(body).toContain('href="?range=7d"');
	});
});

describe('page header on the server', () => {
	it('writes the title, its facts, and what sits beside them', () => {
		const { body } = render(PageHeader, {
			props: {
				title: 'web',
				description: 'The site',
				meta: words('Running'),
				actions: words('Range'),
			},
		});
		expect(body).toContain('<h1');
		expect(body).toContain('The site');
		expect(body).toContain('<span>Running</span>');
		expect(body).toContain('<span>Range</span>');
	});
});

import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DataTable from './data-table.svelte';
import type { Column } from './table.ts';

interface App {
	name: string;
	cpu: number;
}

const columns: Column<App>[] = [
	{ key: 'name', label: 'Name', value: (app) => app.name },
	{
		key: 'cpu',
		label: 'CPU',
		kind: 'number',
		value: (app) => app.cpu,
		text: (app) => `${app.cpu}%`,
	},
];
const rows: App[] = Array.from({ length: 30 }, (_, index) => ({ name: `app${index}`, cpu: index }));
const props = { columns, key: (app: App) => app.name, label: 'Apps' };

describe('data table on the server', () => {
	it('renders the first page whole, with a sticky header and one search above it', () => {
		const { body } = render(DataTable<App>, { props: { ...props, rows, size: 10 } });
		expect(body.match(/<tr class="h-11/g)).toHaveLength(10);
		expect(body).toContain('sticky top-0');
		expect(body.match(/type="search"/g)).toHaveLength(1);
		expect(body).toContain('whitespace-nowrap');
		expect(body).toContain('1–10 of 30');
		expect(body).toMatch(/aria-label="Previous page"[^>]*disabled/);
	});

	it('hides the search when asked, and the pages when one holds every row', () => {
		const { body } = render(DataTable<App>, {
			props: { ...props, rows: rows.slice(0, 20), filterable: false },
		});
		expect(body).not.toContain('type="search"');
		expect(body).not.toContain('<footer');
	});

	it('sorts the first page on the server when asked, and says so to a reader', () => {
		const { body } = render(DataTable<App>, {
			props: { ...props, rows, size: 10, sort: { key: 'cpu', direction: 'descending' } },
		});
		expect(body).toContain('aria-sort="descending"');
		expect(body.indexOf('>29%<')).toBeLessThan(body.indexOf('>28%<'));
		expect(body).not.toContain('>0%<');
	});

	it('makes the first cell a link the whole row answers', () => {
		const { body } = render(DataTable<App>, {
			props: { ...props, rows: rows.slice(0, 1), href: (app: App) => `/apps/${app.name}` },
		});
		expect(body).toContain('href="/apps/app0"');
		expect(body).toContain('after:absolute after:inset-0');
		expect(body).toContain('cursor-pointer');
	});

	it('says plainly when there is nothing, across every column', () => {
		const { body } = render(DataTable<App>, {
			props: { ...props, rows: [], empty: 'No apps yet' },
		});
		expect(body).toContain('colspan="2"');
		expect(body).toContain('No apps yet');
	});

	it('draws a column with a cell snippet through it, still sorted by its value', () => {
		const state: Column<App> = {
			key: 'state',
			label: 'State',
			value: (app) => app.cpu,
			text: (app) => (app.cpu > 1 ? 'Busy' : 'Idle'),
			cell: createRawSnippet((app: () => App) => ({
				render: () => `<b class="chip">${app().name} chip</b>`,
			})),
		};
		const { body } = render(DataTable<App>, {
			props: {
				...props,
				columns: [...columns, state],
				rows: rows.slice(0, 3),
				sort: { key: 'state', direction: 'descending' },
			},
		});
		expect(body).toContain('<b class="chip">app2 chip</b>');
		// The text is not written where the snippet draws the cell.
		expect(body).not.toContain('>Busy<');
		expect(body.indexOf('app2 chip')).toBeLessThan(body.indexOf('app0 chip'));
	});
});

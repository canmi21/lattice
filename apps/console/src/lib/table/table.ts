/**
 * A table's rows as the reader asked for them: searched, sorted, then cut to a page. Pure, so the
 * server's first page is the browser's, and every step is tested apart from the markup.
 */
import type { Snippet } from 'svelte';

export interface Column<Row> {
	key: string;
	label: string;
	/** What the column sorts by and compares a search against. */
	value: (row: Row) => string | number;
	/** The cell as written, which the search reads; the value as it is when not given. */
	text?: (row: Row) => string;
	/** A number sorts as one, sets right, and takes `cpu>10`, `<=2`, `=0` in a search. */
	kind?: 'text' | 'number';
	sortable?: boolean;
	/** Whether the search reads this column. */
	filterable?: boolean;
	/**
	 * The cell drawn rather than written: a badge, a chip, a bar. Sorting and the search still read
	 * `value` and `text`. Inside a row with a link the whole row is the link, so what it draws is
	 * read, not clicked.
	 */
	cell?: Snippet<[Row]>;
}

/** The two orders, named as `aria-sort` names them. */
export interface Sort {
	key: string;
	direction: 'ascending' | 'descending';
}

const collator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

export function written<Row>(column: Column<Row>, row: Row): string {
	return column.text?.(row) ?? String(column.value(row));
}

/** Nothing to compare -- an empty cell, a NaN -- goes last in either order. */
function blank(value: string | number): boolean {
	return value === '' || (typeof value === 'number' && Number.isNaN(value));
}

export function sortRows<Row>(rows: Row[], columns: Column<Row>[], sort?: Sort): Row[] {
	const column = sort && columns.find((one) => one.key === sort.key);
	if (!sort || !column) return rows;
	const sign = sort.direction === 'ascending' ? 1 : -1;
	return rows.toSorted((a, b) => {
		const left = column.value(a);
		const right = column.value(b);
		if (blank(left) || blank(right)) return Number(blank(left)) - Number(blank(right));
		if (typeof left === 'number' && typeof right === 'number') return (left - right) * sign;
		return collator.compare(String(left), String(right)) * sign;
	});
}

const COMPARISON = /^(>=|<=|>|<|=)(-?\d+(?:\.\d+)?)$/;
const NAMED = /^([^<>=]+)((?:>=|<=|>|<|=)-?\d+(?:\.\d+)?)$/;

/**
 * Whether a row's cell answers a term: a comparison for a number column given one, otherwise
 * the written cell containing the term, case aside.
 */
export function matches<Row>(column: Column<Row>, row: Row, query: string): boolean {
	const wanted = query.trim().replace(/\s+/g, '');
	if (!wanted) return true;
	const compared = column.kind === 'number' ? COMPARISON.exec(wanted) : null;
	if (compared) {
		const [, operator, figure] = compared;
		const value = column.value(row);
		const bound = Number(figure);
		if (typeof value !== 'number' || Number.isNaN(value)) return false;
		if (operator === '>') return value > bound;
		if (operator === '<') return value < bound;
		if (operator === '>=') return value >= bound;
		if (operator === '<=') return value <= bound;
		return value === bound;
	}
	return written(column, row).toLowerCase().includes(query.trim().toLowerCase());
}

/** A column named by its key or its label, spaces and case aside. */
function named<Row>(columns: Column<Row>[], name: string): Column<Row> | undefined {
	const plain = (words: string) => words.replace(/\s+/g, '').toLowerCase();
	return columns.find((column) => [column.key, column.label].some((one) => plain(one) === name));
}

/**
 * Whether a row answers one search term. `cpu>10` compares the number column it names; a bare
 * `>10` takes any number column; anything else is text any column may contain.
 */
function answers<Row>(columns: Column<Row>[], row: Row, term: string): boolean {
	const [, name, comparison] = NAMED.exec(term) ?? [];
	const column = name && comparison ? named(columns, name.toLowerCase()) : undefined;
	if (column?.kind === 'number' && comparison) return matches(column, row, comparison);
	return columns.some((one) => matches(one, row, term));
}

/**
 * The rows answering every term of one search across the columns that take it. An operator
 * binds to its neighbors, so `cpu > 10` is the one term `cpu>10`.
 */
export function filterRows<Row>(rows: Row[], columns: Column<Row>[], query: string): Row[] {
	const terms = query
		.trim()
		.replace(/\s*(>=|<=|>|<|=)\s*/g, '$1')
		.split(/\s+/)
		.filter(Boolean);
	const searched = columns.filter((column) => column.filterable ?? true);
	if (terms.length === 0 || searched.length === 0) return rows;
	return rows.filter((row) => terms.every((term) => answers(searched, row, term)));
}

export interface Page<Row> {
	rows: Row[];
	/** The page shown, from 1, held inside the pages there are. */
	page: number;
	pages: number;
	/** The first and last row shown, from 1; both 0 when there are none. */
	from: number;
	to: number;
}

export function pageOf<Row>(rows: Row[], page: number, size: number): Page<Row> {
	const per = Math.max(1, Math.floor(size));
	const pages = Math.max(1, Math.ceil(rows.length / per));
	const held = Math.min(pages, Math.max(1, Math.floor(page)));
	const start = (held - 1) * per;
	const shown = rows.slice(start, start + per);
	return {
		rows: shown,
		page: held,
		pages,
		from: shown.length ? start + 1 : 0,
		to: start + shown.length,
	};
}

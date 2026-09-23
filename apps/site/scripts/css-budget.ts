/**
 * Hold first-load CSS, gzipped, to a budget per route category.
 *
 * Tailwind's sheet and StyleX's are global while scoped CSS is the only layer that splits per
 * route, so moving declarations into the first two shrinks the total and grows what a light page
 * pays before it paints. That trade is worth making and worth watching, which is why it is a
 * number here rather than something the next reader finds by loading a page and feeling that it
 * is slow. Reads what the build wrote, so it runs after one. Budgets are in css-budget.json.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { staleBuild } from './build-freshness.ts';

const SITE = fileURLToPath(new URL('..', import.meta.url));
const ROOT = join(SITE, '../..');
const OUTPUT = join(SITE, '.svelte-kit/output');
const CLIENT = join(OUTPUT, 'client');
const NODES = join(OUTPUT, 'server/nodes');
const MANIFEST = join(OUTPUT, 'server/manifest.js');
const BUDGETS = fileURLToPath(new URL('css-budget.json', import.meta.url));
const RECORD = relative(ROOT, BUDGETS);
const SCAN = relative(ROOT, fileURLToPath(import.meta.url));

/**
 * Pinned rather than left at zlib's default, because a figure written down months ago is only
 * comparable to one measured the same way. What a CDN negotiates is its own business.
 */
const LEVEL = 9;

type Category = {
	name: string;
	/** Bytes, gzipped, that a route in this category may spend before it paints. */
	gzip: number;
	/** Route ids: exact, or a prefix ending in `/*` that takes everything below it. */
	routes: string[];
};

/** What one route costs on first load, and the sheets that cost is made of. */
type Load = {
	route: string;
	category: Category;
	sheets: { path: string; gzip: number }[];
	gzip: number;
};

/** A node file this scan opened and could not read: which file, and which line it wanted. */
type Blind = { file: string; missing: 'index' | 'stylesheets' };

/**
 * The stylesheets each route node declares, by node index.
 *
 * These are the `<link>` tags SSR writes into the head, which is what first-load means here: the
 * bytes a browser must have before it paints, not every sheet the build emitted.
 */
function nodeSheets(): { sheets: Map<number, string[]>; blind: Blind[] } {
	const sheets = new Map<number, string[]>();
	const blind: Blind[] = [];
	for (const entry of readdirSync(NODES)) {
		if (!entry.endsWith('.js')) continue;
		const file = join(NODES, entry);
		const source = readFileSync(file, 'utf8');
		const index = /^export const index = (\d+);$/m.exec(source)?.[1];
		const declared = /^export const stylesheets = (\[[^\]]*\]);$/m.exec(source)?.[1];
		if (index === undefined) {
			blind.push({ file, missing: 'index' });
			continue;
		}
		if (declared === undefined) {
			blind.push({ file, missing: 'stylesheets' });
			continue;
		}
		sheets.set(Number(index), JSON.parse(declared) as string[]);
	}
	return { sheets, blind };
}

// One route entry in the server manifest, taken as text. Importing it instead would pull the
// whole server bundle -- and its environment -- into a check that wants four literals.
const ROUTE =
	/id: "([^"]+)",[\s\S]*?page: (?:null|\{ layouts: \[([^\]]*)\], errors: \[[^\]]*\], leaf: (\d+) \})/g;

// Every route entry opens with one of these, so it counts what ROUTE has to match. ROUTE spans
// lazily to its `page`, and a manifest that stopped writing one would pair route A's id with
// route B's leaf rather than fail -- a short count is what makes that visible.
const ENTRY = /id: "/g;

/**
 * Every route that renders a page, with the node chain SSR walks to render it.
 *
 * Route patterns, not URLs: `/[...path]` is one entry however many articles the corpus holds.
 * That is what makes a budget per category maintainable -- publishing cannot move these figures,
 * and the set changes only when somebody adds a +page.svelte.
 */
function chains(): { found: Map<string, number[]>; entries: number; matched: number } {
	const found = new Map<string, number[]>();
	const source = readFileSync(MANIFEST, 'utf8');
	const routes = [...source.matchAll(ROUTE)];
	for (const [, id, layouts, leaf] of routes) {
		if (id === undefined || leaf === undefined) continue;
		const nodes = [...(layouts ?? '').split(','), leaf].map((part) => Number(part.trim()));
		found.set(
			id,
			nodes.filter((node) => Number.isInteger(node)),
		);
	}
	return { found, entries: source.match(ENTRY)?.length ?? 0, matched: routes.length };
}

/** Whether a category's pattern takes this route: the id itself, or a `/*` prefix above it. */
function takes(pattern: string, route: string): boolean {
	if (pattern.endsWith('/*')) return route.startsWith(pattern.slice(0, -1));
	return pattern === route;
}

/** The sheets a chain loads, in the order the head links them and each one only once. */
function sheetsOf(nodes: number[], declared: Map<number, string[]>): string[] {
	const paths: string[] = [];
	for (const node of nodes) {
		for (const sheet of declared.get(node) ?? []) if (!paths.includes(sheet)) paths.push(sheet);
	}
	return paths;
}

/** What the reader has to do about one route being over: cut a sheet, or raise the number. */
function report(load: Load): string {
	const over = load.gzip - load.category.gzip;
	const raised = Math.ceil(load.gzip / 1024) * 1024;
	const biggest = [...load.sheets].sort((a, b) => b.gzip - a.gzip);
	return [
		`${load.route} is over the '${load.category.name}' budget:`,
		`  budget ${load.category.gzip} bytes gzipped`,
		`  now    ${load.gzip} bytes gzipped, ${over} over`,
		...biggest.map((sheet) => `    ${String(sheet.gzip).padStart(6)}  ${sheet.path}`),
		`  Cut the sheet above that grew, or raise '${load.category.name}' in ${RECORD} to`,
		`  ${raised}, in a commit that says why the page is worth the bytes.`,
	].join('\n');
}

/** Names the file, because 'the shape has changed' sends the reader to read all of the output. */
function unreadable(node: Blind): string {
	const clause =
		node.missing === 'index'
			? 'holds no `export const index` line this scan can read'
			: 'declares an index but no `export const stylesheets` line this scan can read';
	return (
		`${relative(ROOT, node.file)} ${clause}. SvelteKit's output has changed shape, so every ` +
		'route through this node is being charged zero CSS and the budgets are not measurements. ' +
		`Fix the scan in ${SCAN} before trusting it again.`
	);
}

function main(): number {
	let routes: ReturnType<typeof chains>;
	let nodes: ReturnType<typeof nodeSheets>;
	try {
		routes = chains();
		nodes = nodeSheets();
	} catch {
		console.error(`no build under ${OUTPUT}. Build the site first.`);
		return 1;
	}
	const chain = routes.found;
	const declared = nodes.sheets;
	if (chain.size === 0 || declared.size === 0) {
		console.error(
			`read no routes or no nodes from ${OUTPUT}. SvelteKit's output has changed shape and ` +
				'this check is measuring nothing -- fix the scan before trusting it again.',
		);
		return 1;
	}

	// A scan that skipped part of its input makes every number under it fiction, so this returns
	// rather than joining the budget failures below and printing a table it cannot stand behind.
	const untrusted = nodes.blind.map(unreadable);
	for (const [route, walk] of [...chain].sort()) {
		for (const node of walk) {
			if (declared.has(node)) continue;
			untrusted.push(
				`route '${route}' walks node ${node}, and no file under ${relative(ROOT, NODES)} ` +
					"declared it. This route's first-load CSS is being undercounted by whatever that " +
					`node carries. Fix the scan in ${SCAN}.`,
			);
		}
	}
	const dropped = routes.entries - routes.matched;
	if (dropped > 0) {
		untrusted.push(
			`${relative(ROOT, MANIFEST)} holds ${routes.entries} route entries and this scan matched ` +
				`${routes.matched} of them. SvelteKit's manifest has changed shape; the ${dropped} it ` +
				`could not read ${dropped === 1 ? 'is' : 'are'} charged to no budget. Fix the route ` +
				`scan in ${SCAN}.`,
		);
	}
	if (untrusted.length > 0) {
		for (const line of untrusted) console.error(line);
		return 1;
	}

	const stale = staleBuild();
	if (stale !== undefined) {
		console.error(stale);
		return 1;
	}

	const categories = (JSON.parse(readFileSync(BUDGETS, 'utf8')) as { categories: Category[] })
		.categories;
	const loads: Load[] = [];
	const failures: string[] = [];
	// Recorded before the count is judged, so a category that claims a route it has to share is
	// not also accused below of claiming nothing.
	const matched = new Set<string>();

	for (const [route, nodes] of [...chain].sort()) {
		const owners = categories.filter((each) => each.routes.some((p) => takes(p, route)));
		for (const each of owners) matched.add(each.name);
		if (owners.length !== 1) {
			// Both halves of this are the same failure: a page nobody decided about. Guessing a
			// budget for it would make the gate pass on a route it has never measured.
			const taken = owners.map((each) => `'${each.name}'`).join(' and ');
			failures.push(
				owners.length === 0
					? `no category takes route '${route}'. Put it in one in ${RECORD}, or give it its ` +
							'own with a budget, so a new page cannot arrive unmeasured.'
					: `route '${route}' is taken by ${taken}. One route, one budget -- narrow one ` +
							`of them in ${RECORD}.`,
			);
			continue;
		}
		const sheets = sheetsOf(nodes, declared).map((path) => ({
			path,
			gzip: gzipSync(readFileSync(join(CLIENT, path)), { level: LEVEL }).length,
		}));
		const total = sheets.reduce((sum, sheet) => sum + sheet.gzip, 0);
		loads.push({ route, category: owners[0]!, sheets, gzip: total });
	}

	for (const category of categories) {
		if (matched.has(category.name)) continue;
		failures.push(
			`category '${category.name}' took no route: its patterns name pages that are gone, so ` +
				`its budget holds nothing. Fix or drop it in ${RECORD}.`,
		);
	}
	for (const load of loads) if (load.gzip > load.category.gzip) failures.push(report(load));

	if (failures.length > 0) {
		for (const line of failures) console.error(line);
		return 1;
	}

	console.log('first-load CSS inside budget, gzipped:');
	for (const category of categories) {
		const mine = loads.filter((load) => load.category.name === category.name);
		const worst = mine.reduce((a, b) => (b.gzip > a.gzip ? b : a));
		const across = mine.length > 1 ? ` of ${mine.length} routes` : '';
		console.log(
			`  ${category.name.padEnd(8)} ${String(worst.gzip).padStart(6)} / ${category.gzip}` +
				`  worst ${worst.route}${across}`,
		);
	}
	return 0;
}

process.exit(main());

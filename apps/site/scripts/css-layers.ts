/**
 * Hold the order of the three layers that write CSS for this site.
 *
 * Why this has to be measured rather than promised, and why it asserts relative order never
 * layer names -- see spec/architecture/css/layers.md, "The precedence is measured, and it is not
 * promised". Reads the built stylesheets, so it runs after a production build.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('..', import.meta.url));
const CLIENT = join(SITE, '.svelte-kit/output/client');
const SRC = join(SITE, 'src');

/** Tailwind's own layer for the utilities a class attribute names. */
const TAILWIND_UTILITIES = 'utilities';
/** A StyleX atomic class. Its compiler emits `x` followed by a base-36 hash. */
const STYLEX_CLASS = /\.x[a-z0-9]{6,}\b/;
/** Svelte's scoping suffix, which it appends to every selector in a component's block. */
const SVELTE_SCOPE = /\.svelte-[a-z0-9]+\b/;

type Placed = {
	/** Layer names in the order the stylesheet declares them. */
	order: string[];
	/** For each layer that has a body, the selectors inside it. */
	selectors: Map<string, string[]>;
};

/**
 * Walk a stylesheet, recording which layer each selector landed in.
 *
 * A hand-rolled scan rather than a parser: the questions are which layers exist, in what order,
 * and which selectors sit inside each, and all three fall out of brace depth. Bringing in a CSS
 * parser to answer them would be a dependency this check has to keep current for no more truth
 * than counting braces gives it.
 */
function place(css: string): Placed {
	const order: string[] = [];
	const selectors = new Map<string, string[]>();
	// Layer names by the brace depth they were opened at, so a nested at-rule does not lose track
	// of the layer around it.
	const openedAt = new Map<number, string>();
	const note = (name: string) => {
		if (!order.includes(name)) order.push(name);
	};

	let depth = 0;
	let head = '';
	let index = 0;
	while (index < css.length) {
		const ch = css[index];
		if (ch === '/' && css[index + 1] === '*') {
			const end = css.indexOf('*/', index + 2);
			index = end === -1 ? css.length : end + 2;
			continue;
		}
		if (ch === '{') {
			const selector = head.trim();
			head = '';
			depth += 1;
			const layerName = /^@layer\s+([^{]+)$/.exec(selector)?.[1]?.trim();
			if (layerName) {
				note(layerName);
				openedAt.set(depth, layerName);
			} else if (selector.startsWith('@')) {
				// A media or supports block keeps whatever layer encloses it.
			} else if (selector) {
				// The innermost layer still open, if any.
				let current: string | undefined;
				for (let d = depth - 1; d >= 1; d -= 1) {
					const enclosing = openedAt.get(d);
					if (enclosing !== undefined) {
						current = enclosing;
						break;
					}
				}
				// A selector outside every layer needs no record: what is asserted below is that no
				// scoped rule is inside one, and unlayered is where they are supposed to be.
				if (current !== undefined) {
					selectors.set(current, [...(selectors.get(current) ?? []), selector]);
				}
			}
			index += 1;
			continue;
		}
		if (ch === '}') {
			openedAt.delete(depth);
			depth -= 1;
			head = '';
			index += 1;
			continue;
		}
		if (ch === ';' && depth === 0) {
			// `@layer a, b;` declares order without opening a body, and it is how a stylesheet
			// reserves a slot for a layer whose rules arrive later.
			const declared = /^@layer\s+(.+)$/.exec(head.trim())?.[1];
			if (declared) for (const declaredName of declared.split(',')) note(declaredName.trim());
			head = '';
			index += 1;
			continue;
		}
		head += ch;
		index += 1;
	}
	return { order, selectors };
}

/**
 * Every stylesheet the client build emitted.
 *
 * Found by walking rather than by naming a directory: the path under `output/client` carries
 * SvelteKit's `appDir`, which this site has changed once already.
 */
function stylesheets(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...stylesheets(path));
		else if (entry.name.endsWith('.css')) found.push(path);
	}
	return found;
}

/** Whether anything the site compiles actually reaches for the visual layer. */
function visualLayerInUse(dir: string): boolean {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'paraglide') continue;
			if (visualLayerInUse(path)) return true;
			continue;
		}
		if (!/\.(svelte|ts)$/.test(entry.name)) continue;
		if (readFileSync(path, 'utf8').includes('@stylexjs/stylex')) return true;
	}
	return false;
}

function main(): number {
	let assets: string[];
	try {
		assets = stylesheets(CLIENT);
	} catch {
		assets = [];
	}
	if (assets.length === 0) {
		console.error(`no built stylesheets under ${CLIENT}. Build the site first.`);
		return 1;
	}

	const inUse = visualLayerInUse(SRC);
	const failures: string[] = [];
	let sawStylex = false;
	let sawTailwind = false;

	for (const path of assets) {
		const name = path.slice(CLIENT.length + 1);
		const { order, selectors } = place(readFileSync(path, 'utf8'));

		const tailwind = order.indexOf(TAILWIND_UTILITIES);
		const stylex = order.filter(
			(layer) => (selectors.get(layer) ?? []).some((sel) => STYLEX_CLASS.test(sel)),
		);
		if (tailwind !== -1) sawTailwind = true;
		if (stylex.length > 0) sawStylex = true;

		// The visual layer has to outrank the frame. Only checked where both are present: a
		// stylesheet holding one of them says nothing about the pair.
		if (tailwind !== -1) {
			for (const layer of stylex) {
				if (order.indexOf(layer) < tailwind) {
					failures.push(
						`${name}: StyleX layer '${layer}' is declared before Tailwind's ` +
							`'${TAILWIND_UTILITIES}', so a utility now wins over the visual layer`,
					);
				}
			}
		}

		// The escape hatch has to outrank both, which it does by not being in a layer at all.
		for (const [layer, inLayer] of selectors) {
			for (const sel of inLayer) {
				if (SVELTE_SCOPE.test(sel)) {
					failures.push(
						`${name}: scoped rule '${sel}' sits inside layer '${layer}', so a ` +
							`component can no longer override the layers below it`,
					);
				}
			}
		}
	}

	if (!sawTailwind) {
		failures.push(
			`no '${TAILWIND_UTILITIES}' layer in any stylesheet. Tailwind renamed it, or it is ` +
				`no longer emitting layers, and the order this check exists for is unheld.`,
		);
	}
	if (inUse && !sawStylex) {
		failures.push(
			'the site imports @stylexjs/stylex but no stylesheet carries its classes. The ' +
				'plugin is not reaching the build -- check the plugin order in vite.config.ts.',
		);
	}

	if (failures.length > 0) {
		for (const line of failures) console.error(line);
		return 1;
	}
	if (!inUse) {
		console.log('layer order holds; the visual layer is not in use yet, so nothing asserts it');
		return 0;
	}
	console.log('layer order holds: scoped over StyleX over Tailwind');
	return 0;
}

process.exit(main());

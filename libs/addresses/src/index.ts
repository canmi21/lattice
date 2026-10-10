/**
 * Addresses by shape and by contract, for any app that answers its own pages under one prefix: a
 * route's shape puts the thing it is about in the path, a production build asks at the route's
 * contract address instead, and the server reads either back to the route. The site's API and the
 * console's views both ask this way. See the site's spec/architecture/site-api.md, "The pages ask
 * by contract, not by name", and the workspace's spec/addresses.md.
 */

const PLACEHOLDER = /^\{([a-z]+)(\*?)\}$/;

/** The placeholders of `shape`, in order, each with whether it may hold a slash. */
export function placeholders(shape: string): { name: string; rest: boolean }[] {
	return shape.split('/').flatMap((segment) => {
		const match = PLACEHOLDER.exec(segment);
		return match ? [{ name: match[1] as string, rest: match[2] === '*' }] : [];
	});
}

/**
 * `shape` filled from `parameters`: its path, and the parameters it does not take in the path,
 * left for the query. Undefined when a placeholder has no value.
 */
export function fill(
	shape: string,
	parameters: Readonly<Record<string, string>> = {},
): { path: string; query: Record<string, string> } | undefined {
	const query: Record<string, string> = { ...parameters };
	const segments: string[] = [];
	for (const segment of shape.split('/')) {
		const match = PLACEHOLDER.exec(segment);
		if (!match) {
			segments.push(segment);
			continue;
		}
		const value = parameters[match[1] as string];
		if (!value) return undefined;
		delete query[match[1] as string];
		segments.push(
			match[2] === '*'
				? value.split('/').map(encodeURIComponent).join('/')
				: encodeURIComponent(value),
		);
	}
	return { path: segments.join('/'), query };
}

/** `path` read against `shape`: the placeholders' values, or undefined when it is not the shape. */
export function read(shape: string, path: string): Record<string, string> | undefined {
	const expected = shape.split('/');
	const asked = path.split('/');
	const values: Record<string, string> = {};
	for (const [index, segment] of expected.entries()) {
		const match = PLACEHOLDER.exec(segment);
		if (!match) {
			if (asked[index] !== segment) return undefined;
			continue;
		}
		const taken = match[2] === '*' ? asked.slice(index).join('/') : asked[index];
		if (!taken) return undefined;
		values[match[1] as string] = decodeURIComponent(taken);
		if (match[2] === '*') return values;
	}
	return asked.length === expected.length ? values : undefined;
}

/**
 * Each route's shape as a page asks it: the contract address a production build `stated`,
 * followed by the placeholders of the route's own shape; the shape itself where nothing was
 * stated, as in development and in tests.
 */
export function asking<R extends string>(
	shapes: Readonly<Record<R, string>>,
	stated: Readonly<Record<R, string>> | undefined,
): Record<R, string> {
	return Object.fromEntries(
		(Object.entries(shapes) as [R, string][]).map(([route, shape]) => {
			if (typeof stated !== 'object' || stated === null) return [route, shape];
			const after = placeholders(shape).map(({ name, rest }) => `/{${name}${rest ? '*' : ''}}`);
			return [route, `${stated[route]}${after.join('')}`];
		}),
	) as Record<R, string>;
}

/**
 * The address of `route` under `prefix`: the thing it is about in the path, the rest of
 * `parameters` as its search.
 */
export function pathOf<R extends string>(
	asked: Readonly<Record<R, string>>,
	prefix: string,
	route: R,
	parameters?: Readonly<Record<string, string>>,
): string {
	const filled = fill(asked[route], parameters);
	if (!filled) throw new Error(`the ${route} route is asked without what its path names`);
	const search = new URLSearchParams(filled.query).toString();
	return `${prefix}${filled.path}${search ? `?${search}` : ''}`;
}

/**
 * The route an address under the prefix names, and the parameters its path holds; undefined for
 * one that names none.
 */
export function routeOf<R extends string>(
	asked: Readonly<Record<R, string>>,
	path: string,
): { route: R; query: Record<string, string> } | undefined {
	for (const [route, shape] of Object.entries(asked) as [R, string][]) {
		const query = read(shape, path);
		if (query) return { route, query };
	}
	return undefined;
}

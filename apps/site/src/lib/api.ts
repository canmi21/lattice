import { fill, placeholders, read, ROUTES, type Route, SHAPES } from '@canmi/site-api/routes';

/** Stated by a production build; see vite.config.ts. Absent in development and in tests. */
declare const STATED_API_ADDRESSES: Readonly<Record<Route, string>> | undefined;

/**
 * Each route's shape under `/api/`: in production the contract address the build stated, which
 * moves only with the route's contract, followed by the placeholders of the route's own shape; in
 * development the route's shape itself. See spec/architecture/site-api.md, "The pages
 * ask by contract, not by name", and the workspace's spec/addresses.md.
 */
const ASKED: Readonly<Record<Route, string>> = Object.fromEntries(
	ROUTES.map((route) => {
		if (typeof STATED_API_ADDRESSES !== 'object' || STATED_API_ADDRESSES === null) {
			return [route, SHAPES[route]];
		}
		const after = placeholders(SHAPES[route]).map(
			({ name, rest }) => `/{${name}${rest ? '*' : ''}}`,
		);
		return [route, `${STATED_API_ADDRESSES[route]}${after.join('')}`];
	}),
) as Record<Route, string>;

/**
 * The site's own address for one of its API's routes: the thing it is about in the path, and the
 * rest of `parameters` as its search.
 */
export function apiPath(route: Route, parameters?: Record<string, string>): string {
	const filled = fill(ASKED[route], parameters);
	if (!filled) throw new Error(`the ${route} route is asked without what its path names`);
	const search = new URLSearchParams(filled.query).toString();
	return `/api/${filled.path}${search ? `?${search}` : ''}`;
}

/**
 * The route an address under `/api/` names, and the query its handler reads: the path's
 * placeholders' values as parameters. Undefined for an address that names none.
 */
export function readAddress(
	path: string,
): { route: Route; query: Record<string, string> } | undefined {
	for (const route of ROUTES) {
		const query = read(ASKED[route], path);
		if (query) return { route, query };
	}
	return undefined;
}

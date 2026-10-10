import { asking, pathOf, routeOf } from '@canmi/addresses';
import { type Route, SHAPES } from '@canmi/site-api/routes';

/** Stated by a production build; see vite.config.ts. Absent in development and in tests. */
declare const STATED_API_ADDRESSES: Readonly<Record<Route, string>> | undefined;

/**
 * Each route's shape under `/api/`: in production the contract address the build stated, which
 * moves only with the route's contract, followed by the placeholders of the route's own shape; in
 * development the route's shape itself. See spec/architecture/site-api.md, "The pages
 * ask by contract, not by name", and the workspace's spec/addresses.md.
 */
const ASKED = asking<Route>(
	SHAPES,
	typeof STATED_API_ADDRESSES === 'object' ? STATED_API_ADDRESSES : undefined,
);

/**
 * The site's own address for one of its API's routes: the thing it is about in the path, and the
 * rest of `parameters` as its search.
 */
export function apiPath(route: Route, parameters?: Record<string, string>): string {
	return pathOf(ASKED, '/api/', route, parameters);
}

/**
 * The route an address under `/api/` names, and the query its handler reads: the path's
 * placeholders' values as parameters. Undefined for an address that names none.
 */
export function readAddress(
	path: string,
): { route: Route; query: Record<string, string> } | undefined {
	return routeOf(ASKED, path);
}

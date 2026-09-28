import { ROUTES, type Route } from '@canmi/site-api/routes';

/** Stated by a production build; see vite.config.ts. Absent in development and in tests. */
declare const STATED_API_ADDRESSES: Readonly<Record<Route, string>> | undefined;

/**
 * Each route's address under `/api/`: the one the build stated, which moves only with the route's
 * contract, or in development the route's own name. See spec/architecture/services.md, "The pages
 * ask by contract, not by name".
 */
const ADDRESSES: Readonly<Record<Route, string>> =
	typeof STATED_API_ADDRESSES === 'object' && STATED_API_ADDRESSES !== null
		? STATED_API_ADDRESSES
		: (Object.fromEntries(ROUTES.map((route) => [route, route])) as Record<Route, string>);

const ROUTE_AT: ReadonlyMap<string, Route> = new Map(
	ROUTES.map((route) => [ADDRESSES[route], route]),
);

/** The site's own address for one of its API's routes, with `query` as its search. */
export function apiPath(route: Route, query?: Record<string, string>): string {
	const search = query ? `?${new URLSearchParams(query)}` : '';
	return `/api/${ADDRESSES[route]}${search}`;
}

/** The route an address under `/api/` names, or undefined for one that names none. */
export function routeOf(address: string): Route | undefined {
	return ROUTE_AT.get(address);
}

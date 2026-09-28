import { ROUTES, type Route } from '@canmi/site-api/routes';

/** The site's own address for one of its API's routes, with `query` as its search. */
export function apiPath(route: Route, query?: Record<string, string>): string {
	const search = query ? `?${new URLSearchParams(query)}` : '';
	return `/api/${route}${search}`;
}

const KNOWN: ReadonlySet<string> = new Set(ROUTES);

/** The route an address under `/api/` names, or undefined for one that names none. */
export function routeOf(segment: string): Route | undefined {
	return KNOWN.has(segment) ? (segment as Route) : undefined;
}

/**
 * The API as the site's Worker is allowed to see it: something that answers a request. The site's
 * program checks against the browser's globals and this API against workerd's, and the two
 * disagree about `Response` and streams, so the site imports this declaration rather than the
 * source. See the workspace's spec/code.md, "A runtime's globals decide which program checks a
 * file". `app.test.ts` holds the real app to it.
 */
export interface Api {
	fetch(
		request: Request,
		env: Readonly<Record<string, unknown>>,
		context?: unknown,
	): Response | Promise<Response>;
}

declare const api: Api;
export default api;
export { PUBLIC_ROUTES, ROUTES, type Route } from './contract/routes';

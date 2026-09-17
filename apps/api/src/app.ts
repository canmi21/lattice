import { robotsTxt } from '@canmi/robots';
import { DEVELOPMENT_PORTS, URLS, isDevHost, pickUrls } from '@canmi/urls';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './bindings';
import corpus from './corpus';
import engagement from './engagement';
import { failure } from './respond';
import image from './image';

/**
 * The JSON API.
 *
 * Separate from `index.ts` so tests exercise the routes without going through the error
 * reporter, which needs a runtime environment none of them have.
 *
 * Alongside the asset metadata endpoint it carries the redirects and robots policy that any
 * host answering on a domain has to have.
 */
const app = new Hono<{ Bindings: Bindings }>();

const ORIGINS = new Set([
	URLS.apps.production.site,
	URLS.apps.development.site,
	URLS.internal.app,
	URLS.internal.infra,
	URLS.internal.link,
]);

/**
 * The list and nothing else -- except a request with no `Origin`, and except in development.
 *
 * A request with no `Origin` is not a browser asking, so `*` grants it nothing -- but SvelteKit
 * simulates CORS inside `load` and throws without it, which is how the site reaches this API
 * while rendering. `Vary: Origin` is on every answer, so no cache serves one of these to the other.
 */
function allowOrigin(origin: string, c: Context): string | null {
	if (!origin) return '*';
	if (ORIGINS.has(origin)) return origin;
	// `localhost` and `127.0.0.1` are one machine spelled two ways, and the list names only the
	// first -- so browsing the development site by IP produced an answer with no header at all,
	// which SvelteKit's simulation treats as fatal, and the homepage 500ed while working by name.
	// The port still has to be the development site's: an unlisted port is a stranger wherever it
	// is. Gated on the host this request arrived at, so production's list is untouched.
	const asked = URL.parse(origin);
	if (!asked || !isDevHost(new URL(c.req.url).hostname)) return null;
	return isDevHost(asked.hostname) && asked.port === String(DEVELOPMENT_PORTS.site) ? origin : null;
}

app.use(
	'*',
	cors({
		origin: allowOrigin,
		allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		maxAge: 86_400,
	}),
);

// Browsers ask any origin they touch for /favicon.ico whether or not it serves pages. Sending
// them to the CDN answers it once rather than logging a 404 on every visit.
app.get('/favicon.ico', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.cdn}/favicon.ico`, 301);
});

// The API root is not a page. `ref` marks where the visitor came from, so the site can tell
// this apart from someone typing the address.
app.get('/', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.site}/?ref=api`, 302);
});

app.route('/image', image);
app.route('/', corpus);
app.route('/', engagement);

// An API has nothing to index, and its URLs surfacing in search results would compete with
// the pages that call it.
app.get('/robots.txt', (c) => c.text(robotsTxt({ disallow: ['/'] })));

/**
 * A failure is JSON and is never stored, however far up it was thrown.
 *
 * Five minutes on "the API failed" would turn a blip into an outage -- see
 * spec/architecture/artifacts.md. Logged rather than reported: the error reporter wraps this
 * app from index.ts and cannot see what is handled here.
 */
app.onError((error, c) => {
	console.error(error);
	return failure(c, 500, 'unavailable', { 'Cache-Control': 'no-store' });
});

export default app;

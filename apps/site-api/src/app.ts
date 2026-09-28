import { PUBLISHED, UNCHANGING } from '@canmi/cache';
import { robotsTxt } from '@canmi/robots';
import { isDevHost, pickUrls } from '@canmi/urls';
import { Hono } from 'hono';
import type { Bindings } from './bindings';
import batch from './batch';
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
 * host answering on a domain has to have. CORS is the gateway's, in front of it; see
 * spec/architecture/services.md, "The gateway holds what every API would otherwise repeat".
 */
const app = new Hono<{ Bindings: Bindings }>();

// Browsers ask any origin they touch for /favicon.ico whether or not it serves pages. The name is
// permanent and the alias layer is where it lives, so this is a 301 with the year to match -- what
// it currently resolves to is that layer's to say, and it says so briefly. The same answer the
// site and the CDN give. See spec/architecture/delivery.md.
app.get('/favicon.ico', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	c.header('Cache-Control', UNCHANGING);
	return c.redirect(`${urls.alias}/symlink/favicon.ico`, 301);
});

// The API root is not a page. `ref` marks where the visitor came from, so the site can tell
// this apart from someone typing the address.
app.get('/', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.site}/?ref=api`, 302);
});

app.route('/', image);
app.route('/', corpus);
app.route('/', batch);
app.route('/', engagement);

// An API has nothing to index, and its URLs surfacing in search results would compete with
// the pages that call it.
app.get('/robots.txt', (c) => c.text(robotsTxt({ disallow: ['/'] })));

/**
 * A route that does not exist says so in the envelope, like every other refusal.
 *
 * Without this, hono answers `text/plain` and a caller parsing JSON gets a syntax error instead of
 * a message -- which is what asking for `GET /batch` looked like, that route being POST-only. The
 * envelope is the whole point of having one: a consumer reads one shape whether the refusal came
 * from a handler or from never reaching one. Five minutes, because which routes exist changes when
 * this worker is deployed and not before. See spec/architecture/artifacts.md.
 */
app.notFound((c) => failure(c, 404, 'no_such_route', { 'Cache-Control': PUBLISHED }));

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

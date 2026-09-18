import { robotsTxt } from '@canmi/robots';
import { isDevHost, pickUrls } from '@canmi/urls';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { failure } from './respond';
import { resolve } from './resolve';

/**
 * `aka` -- the layer that resolves a name and holds nothing.
 *
 * The only one of the three layers with no store of its own: it asks the API what a name means and
 * sends the caller to the CDN. It exists for the resolution that cannot happen at build time --
 * an article's own image changes when the article does, but a favicon changes on somebody else's
 * schedule. See spec/architecture/delivery.md.
 */
const app = new Hono();

// Any origin may read: everything reachable here is public, and an answer is a redirect rather
// than bytes. Methods stay read-only on the layer itself; a preserved redirect carries whatever
// the caller sent on to the CDN.
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'] }));

app.get('/', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.site}/?ref=aka`, 302);
});

/**
 * This host's own policy, and not a copy of anybody else's.
 *
 * A robots policy is a statement about the host it is served from, so it stays on each of them
 * rather than moving here with the brand assets. Everything reachable here is a redirect to a
 * public object, so nothing is disallowed.
 */
app.get('/robots.txt', (c) => {
	c.header('Cache-Control', 'public, max-age=300');
	return c.text(robotsTxt({ disallow: [''] }));
});

/**
 * Every fixed name this site publishes, resolved by asking the API.
 *
 * One segment and no extension-less names: what reaches here is what a browser, a mail client or
 * a crawler constructs on its own -- `/favicon.ico`, `/favicon.svg`, the BIMI mark. Anything the
 * root does not name is a 404, so the list lives in the corpus rather than in this worker.
 */
app.get('/:name{[a-z0-9][a-z0-9.-]*\\.[a-z0-9]+}', (c) => resolve(c, c.req.param('name')));

app.notFound((c) => failure(c, 404, 'no_such_name'));

app.onError((error, c) => {
	console.error(error);
	const response = failure(c, 500, 'unavailable');
	response.headers.set('Cache-Control', 'no-store');
	return response;
});

export default app;

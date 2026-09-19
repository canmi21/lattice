import { robotsTxt } from '@canmi/robots';
import { isDevHost, pickUrls } from '@canmi/urls';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cacheControl, NEVER, REFUSED } from './cache';
import { failure } from './respond';
import { isValidHostname } from './hostname';
import { resolve, tonesFor } from './resolve';
import { resource } from './resource';

/**
 * `ill.li` -- the layer that resolves a name and holds nothing.
 *
 * The only one of the three layers with no store of its own: it asks the API what a name means and
 * sends the caller wherever the answer says. It exists for the resolution that cannot happen at
 * build time -- an article's own image changes when the article does, but a favicon changes on
 * somebody else's schedule. See spec/architecture/delivery.md.
 */
const app = new Hono();

// Any origin may read: everything reachable here is public, and an answer is a redirect rather
// than bytes. Methods stay read-only on the layer itself; a preserved redirect carries whatever
// the caller sent on to the CDN.
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'] }));
// Before any route, so nothing can answer without a lifetime. See ./cache.ts.
app.use('*', cacheControl);

// Permanent, because this host's root resolves nothing: which site it belongs to is not a thing
// that changes, so a browser that learns it once need never ask again. `ref` marks where the
// visitor came from, so the site can tell this apart from someone typing the address.
app.get('/', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.site}/?ref=alias`, 301);
});

/**
 * This host's own policy, and not a copy of anybody else's.
 *
 * A robots policy is a statement about the host it is served from, so it stays on each of them
 * rather than moving here with the brand assets. Everything reachable here is a redirect to a
 * public object, so nothing is disallowed.
 */
app.get('/robots.txt', (c) => {
	c.header('Cache-Control', REFUSED);
	return c.text(robotsTxt({ disallow: [''] }));
});

/**
 * A resource, answered with whatever it declares itself canonically to be.
 *
 * Five characters of base36 and no dot -- a rid, as spec/architecture/resource.md allocates one.
 * A fixed name always carries a dot and `robots.txt` is six characters before one, so nothing
 * that belongs elsewhere on this host can parse as a rid: the split is arithmetic, not a guess.
 */
app.get('/:rid{[0-9a-z]{5}}', (c) => resource(c, c.req.param('rid')));

/**
 * Every fixed name this site publishes, resolved by asking the API.
 *
 * Under a prefix rather than at the root, so the root belongs to rids alone: what reaches here is
 * what a browser, a mail client or a crawler constructs on its own -- `favicon.ico`, `favicon.svg`,
 * the BIMI mark -- and the list of them lives in the corpus rather than in this worker.
 */
app.get('/symlink/:name{[a-z0-9][a-z0-9.-]*\\.[a-z0-9]+}', (c) =>
	resolve(c, [c.req.param('name')]),
);

/**
 * Another site's icon, by the domain it belongs to.
 *
 * The domain stays in the address because that is what a link card can construct on its own, and
 * because it is the half worth reading. What it means changes when that site redraws its icon --
 * somebody else's schedule -- which is the whole reason this is resolved per request rather than
 * compiled into every article that mentions them.
 *
 * `?tone=` selects, so a request carrying one is preserved with a `307` rather than followed.
 */
app.get('/favicon/:domain', async (c) => {
	const domain = c.req.param('domain').toLowerCase();
	if (!isValidHostname(domain)) return failure(c, 400, 'invalid_hostname');
	return resolve(
		c,
		tonesFor(c.req.query('tone')).map((tone) => `favicon/${domain}/${tone}`),
	);
});

/**
 * Anything else, and `400` rather than `404` because the two say different things here too.
 *
 * A `404` from this host is a fact about the corpus -- the address named something and the corpus
 * publishes no such thing -- and it stops being true at the next publication. An address none of
 * the routes above expresses names nothing at all and never will. Last, so it takes whatever
 * nothing above claimed, methods included. The same split apps/cdn keeps.
 */
app.all('*', (c) => failure(c, 400, 'not_an_address'));

app.onError((error, c) => {
	console.error(error);
	const response = failure(c, 500, 'unavailable');
	response.headers.set('Cache-Control', NEVER);
	return response;
});

export default app;

import { robotsFor } from '@canmi/robots';
import { SECURITY_TXT_PATH, securityResponse } from '@canmi/security';
import { isDevHost, normalizedLocation, pickUrls } from '@canmi/urls';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cacheControl, NEVER, REFUSED } from './cache';
import { failure } from './respond';
import { resolve } from './resolve';
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
// One spelling per address: a path that normalizes differently goes where it should, method kept.
// See spec/architecture/delivery.md, "Every address has one spelling".
app.use('*', async (c, next) => {
	const location = normalizedLocation(new URL(c.req.url));
	return location ? c.redirect(location, 308) : next();
});

// Permanent, because this host's root resolves nothing: which site it belongs to is not a thing
// that changes, so a browser that learns it once need never ask again. `ref` marks where the
// visitor came from, so the site can tell this apart from someone typing the address.
app.get('/', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.site}/?ref=alias`, 301);
});

// The name a browser asks every origin for: this layer's own `aka` mark, resolved in one hop. See
// spec/architecture/delivery.md, "A page follows the name for the browser".
app.get('/favicon.ico', (c) => resolve(c, 'aka/favicon.ico'));

/**
 * This host's own policy, and not a copy of anybody else's.
 *
 * A robots policy is a statement about the host it is served from, so it stays on each of them
 * rather than moving here with the brand assets. Everything reachable here is a redirect to a
 * public object, so nothing is disallowed.
 */
app.get('/robots.txt', (c) => {
	c.header('Cache-Control', REFUSED);
	return c.text(robotsFor('aka'));
});

// security.txt, the same on every host of ours; see spec/architecture/firewall.md.
app.get(SECURITY_TXT_PATH, (c) => securityResponse(c.req.raw, 'aka'));

/**
 * A resource, answered with whatever it declares itself canonically to be.
 *
 * Five characters of base36 and no dot -- a rid, as spec/architecture/resource.md allocates one.
 * A fixed name always carries a dot and `robots.txt` is six characters before one, so nothing
 * that belongs elsewhere on this host can parse as a rid: the split is arithmetic, not a guess.
 */
app.get('/:rid{[0-9a-z]{5}}', (c) => resource(c, c.req.param('rid')));

/**
 * The site's marks by their bare names, resolved by asking the API.
 *
 * Under a prefix rather than at the root, so the root belongs to rids alone. Kept for the addresses
 * already out there -- every host's year-long `301` from `/favicon.ico`, the BIMI record -- while a
 * page asks the scoped form below.
 */
app.get('/symlink/:name{[a-z0-9][a-z0-9.-]*\\.[a-z0-9]+}', (c) => resolve(c, c.req.param('name')));

/**
 * A scope's marks, `/symlink/{scope}/{file}`: the form every page asks. See
 * spec/architecture/delivery.md, "Every fixed name is a record".
 */
app.get('/symlink/:scope{[a-z][a-z0-9-]*}/:file{[a-z0-9][a-z0-9.-]*\\.[a-z0-9]+}', (c) =>
	resolve(c, `${c.req.param('scope')}/${c.req.param('file')}`),
);

/**
 * Anything else, and `400` rather than `404` because the two say different things here too.
 *
 * A `404` from this host is a fact about the corpus -- the address named something and the corpus
 * publishes no such thing -- and it stops being true at the next publication. An address none of
 * the routes above expresses names nothing at all and never will. Last, so it takes whatever
 * nothing above claimed, methods included. The same split apps/cdn keeps.
 */
app.all('*', (c) => failure(c, 400, 'invalid_address'));

app.onError((error, c) => {
	console.error(error);
	const response = failure(c, 500, 'service_unavailable');
	response.headers.set('Cache-Control', NEVER);
	return response;
});

export default app;

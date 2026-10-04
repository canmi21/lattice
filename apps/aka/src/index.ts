import { Hono } from 'hono';
import { cacheControl, NEVER } from './cache';
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

// CORS, the path's spelling and the files every host answers -- `/`, `favicon.ico`, `robots.txt`,
// `security.txt` -- are the gateway's, which this layer stands behind. See
// spec/architecture/gateway.md.
//
// Before any route, so nothing can answer without a lifetime. See ./cache.ts.
app.use('*', cacheControl);

/**
 * A resource, answered with whatever it declares itself canonically to be.
 *
 * Five characters of base36 and no dot -- a rid, as spec/architecture/resource.md allocates one.
 * A fixed name always carries a dot and `robots.txt` is six characters before one, so nothing
 * that belongs elsewhere on this host can parse as a rid: the split is arithmetic, not a guess.
 */
const names = new Hono();
names.get('/:rid{[0-9a-z]{5}}', (c) => resource(c, c.req.param('rid')));

/**
 * The site's marks by their bare names, resolved by asking the API.
 *
 * Under a prefix rather than at the root, so the root belongs to rids alone. Kept for the addresses
 * already out there -- every host's year-long `301` from `/favicon.ico`, the BIMI record -- while a
 * page asks the scoped form below.
 */
names.get('/symlink/:name{[a-z0-9][a-z0-9.-]*\\.[a-z0-9]+}', (c) =>
	resolve(c, c.req.param('name')),
);

/**
 * A scope's marks, `/symlink/{scope}/{file}`: the form every page asks. See
 * spec/architecture/delivery.md, "Every fixed name is a record".
 */
names.get('/symlink/:scope{[a-z][a-z0-9-]*}/:file{[a-z0-9][a-z0-9.-]*\\.[a-z0-9]+}', (c) =>
	resolve(c, `${c.req.param('scope')}/${c.req.param('file')}`),
);
// At `/v1/`. See spec/architecture/gateway.md, "A version is in the path, and it moves only on a
// break".
app.route('/v1', names);

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

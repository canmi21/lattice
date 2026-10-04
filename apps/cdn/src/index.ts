import { Hono } from 'hono';
import { cacheControl } from './cache';
import github from './github';
import object from './object';
import derive from './derive';
import type { Bindings } from '@canmi/store';
import { failure } from './respond';

/**
 * The CDN: three groups of address, and the handful of names a host has to answer for anyway.
 *
 * `/object` and `/derive` are content addressing and `/proxy` is somebody else's bytes fetched
 * live. Nothing else is an address here -- a request outside the three is refused rather than
 * looked for, and a name that has to be resolved belongs to the layer above, which is the one
 * thing this host will not do. See spec/architecture/delivery.md.
 */
const app = new Hono<{ Bindings: Bindings }>();

// CORS, the path's spelling and the files every host answers -- `/`, `favicon.ico`, `robots.txt`,
// `security.txt` -- are the gateway's, which this host stands behind. See
// spec/architecture/gateway.md.
//
// One rule over the three groups, and the floor under everything else, for what this host keeps in
// its own cache; the gateway stamps what leaves it. See ./cache.ts.
app.use('*', cacheControl);

const groups = new Hono<{ Bindings: Bindings }>();
groups.route('/object', object);
groups.route('/derive', derive);
groups.route('/proxy/github', github);

/**
 * Where the proxies used to answer, kept as a redirect rather than as a second spelling: rdm's
 * builds already out there fetch their updates from `/github/release/...`.
 *
 * Permanent and method-preserving: a 308 says the path moved without inviting a client to turn
 * its request into a `GET`. Relative, since each host spells what comes before `github/` its own
 * way: one `../` per segment after it climbs back to where `proxy/github/` belongs.
 */
groups.all('/github/*', (c) => {
	const url = new URL(c.req.url);
	const rest = url.pathname.slice(url.pathname.indexOf('/github/') + '/github/'.length);
	const up = '../'.repeat(rest.split('/').length);
	return c.redirect(`${up}proxy/github/${rest}${url.search}`, 308);
});
// At `/v3/`. See spec/architecture/gateway.md, "A version is in the path, and it moves only on a
// break".
app.route('/v3', groups);

/**
 * Anything else, and `400` rather than `404` because the two say different things.
 *
 * A `404` from this host is a fact about the bucket -- the address was well formed and the
 * object was never uploaded or has been swept -- and it becomes untrue the moment somebody
 * publishes. An address outside the three groups is a fact about the address: there is no such
 * route, there never will be, and collapsing the two would throw away the only signal that
 * tells a sweep from a typo. Last, so it takes what nothing above claimed, methods included.
 */
app.all('*', (c) => failure(c, 400, 'invalid_address'));

/**
 * A failure is JSON and is never stored, however far up it was thrown.
 *
 * `no-store` rather than the five minutes a miss gets: a 404 is a fact about the bucket and a 500
 * is a fact about this moment, and caching the second turns a blip into an outage. The same
 * asymmetry the API keeps. See spec/architecture/artifacts.md.
 */
app.onError((error, c) => {
	console.error(error);
	const response = failure(c, 500, 'service_unavailable');
	response.headers.set('Cache-Control', 'no-store');
	return response;
});

export default app;

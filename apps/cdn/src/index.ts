import { PUBLISHED, UNCHANGING } from '@canmi/cache';
import { robotsTxt } from '@canmi/robots';
import { isDevHost, pickUrls } from '@canmi/urls';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
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

// Any origin may read: everything served here is public, so an allowlist blocked only embedding,
// which is what a CDN is for. Methods stay read-only, granting nothing beyond a GET.
//
// `allowHeaders` is absent for the same reason: naming headers means guessing which ones an
// embedder sends (`Range` among them) and breaking the rest, where a reflected preflight
// grants nothing anyway without credentials to reach. The API stays origin-restricted instead.
// A scanner flagging the reflected preflight has found a pattern, not a hole.
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'] }));
// One rule over the three groups, and the floor under everything else. See ./cache.ts.
app.use('*', cacheControl);

// Permanent: which host the site is reached at is not a thing that changes, so a browser that
// learns this once need never ask again.
app.get('/', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.site}/?ref=cdn`, 301);
});

/**
 * A browser asks any origin it touches for this, and this one serves objects rather than pages.
 *
 * The year is honest because the target is the permanent name and not the object behind it: what
 * moves when the mark is redrawn is what the alias layer answers, and that keeps its own five
 * minutes. Nothing to range over either -- a redirect has no body.
 */
app.get('/favicon.ico', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	c.header('Cache-Control', UNCHANGING);
	return c.redirect(`${urls.alias}/symlink/favicon.ico`, 301);
});

// Nothing here is disallowed. `Disallow: /` blocked OpenGraph cards too, and adding
// `Allow: /opengraph/` did not fix it for X: Twitterbot implements the original 1994
// robots.txt draft, which has no `Allow` and never sees the exception.
//
// A per-agent block would mean guessing which crawlers parse which decade of the format,
// forever, over something mild. So everything is fetchable, and cached briefly.
//
// Not a symlink: a robots policy is a statement about the host serving it, and these differ.
app.get('/robots.txt', (c) => {
	c.header('Cache-Control', PUBLISHED);
	return c.text(robotsTxt({ disallow: [''] }));
});

/**
 * Where the proxies used to answer, kept as a redirect rather than as a second spelling.
 *
 * Permanent and method-preserving: the path moved under `/proxy` and will not move back, and a
 * 308 is the one code that says so without inviting a client to turn its request into a `GET`.
 */
app.all('/github/*', (c) => {
	const url = new URL(c.req.url);
	return c.redirect(`/proxy${url.pathname}${url.search}`, 308);
});

/**
 * The three groups, and the whole of what this host expresses.
 *
 * Two of them are content-addressed: `/object/{cid}.{ext}` is the lookup on its own, and
 * `/derive/{cid}.{ext}.{ext}` is that same lookup plus one conversion the caller spelled out in
 * full. `/proxy/{vendor}` is a live fetch from somebody else. None of the three asks anything
 * anywhere what a name means, which is what lets this host answer with every other one down.
 */
app.route('/object', object);
app.route('/derive', derive);
app.route('/proxy/github', github);

/**
 * Anything else, and `400` rather than `404` because the two say different things.
 *
 * A `404` from this host is a fact about the bucket -- the address was well formed and the
 * object was never uploaded or has been swept -- and it becomes untrue the moment somebody
 * publishes. An address outside the three groups is a fact about the address: there is no such
 * route, there never will be, and collapsing the two would throw away the only signal that
 * tells a sweep from a typo. Last, so it takes what nothing above claimed, methods included.
 */
app.all('*', (c) => failure(c, 400, 'not_an_address'));

/**
 * A failure is JSON and is never stored, however far up it was thrown.
 *
 * `no-store` rather than the five minutes a miss gets: a 404 is a fact about the bucket and a 500
 * is a fact about this moment, and caching the second turns a blip into an outage. The same
 * asymmetry the API keeps. See spec/architecture/artifacts.md.
 */
app.onError((error, c) => {
	console.error(error);
	const response = failure(c, 500, 'unavailable');
	response.headers.set('Cache-Control', 'no-store');
	return response;
});

export default app;

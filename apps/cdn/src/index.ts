import { ARTIFACT_TYPES, PUBLIC_TYPES } from '@canmi/artifacts';
import { robotsTxt } from '@canmi/robots';
import { isDevHost, pickUrls } from '@canmi/urls';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { addressable } from './address';
import { artifact } from './artifact';
import { BRIEFLY, cacheControl } from './cache';
import favicon from './favicon';
import image from './image';
import github from './github';
import license from './license';
import opengraph from './opengraph';
import {
	isUnsatisfiable,
	read,
	toResponse,
	unsatisfiableResponse,
	type Bindings,
} from '@canmi/store';
import { stored } from './stored';
import { failure } from './respond';

const app = new Hono<{ Bindings: Bindings }>();

// Any origin may read: everything served here is public, so an allowlist blocked only embedding,
// which is what a CDN is for. Methods stay read-only, granting nothing beyond a GET.
//
// `allowHeaders` is absent for the same reason: naming headers means guessing which ones an
// embedder sends (`Range` among them) and breaking the rest, where a reflected preflight
// grants nothing anyway without credentials to reach. The API stays origin-restricted instead.
// A scanner flagging the reflected preflight has found a pattern, not a hole.
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'] }));
app.use('*', cacheControl);
// Before any route: what this host can express at all. See ./address.ts.
app.use('*', addressable);

app.get('/', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.site}/?ref=cdn`, 302);
});

// A browser asks any origin it touches for this, and this one serves objects rather than pages.
// The name is permanent and the alias layer is where it lives.
app.get('/favicon.ico', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.alias}/favicon.ico`, 301);
});

// Nothing here is disallowed. `Disallow: /` blocked OpenGraph cards too, and adding
// `Allow: /opengraph/` did not fix it for X: Twitterbot implements the original 1994
// robots.txt draft, which has no `Allow` and never sees the exception.
//
// A per-agent block would mean guessing which crawlers parse which decade of the format,
// forever, over something mild. So the policy stops being clever: everything is fetchable,
// cached briefly -- like every name without a hash in it -- so a correction takes minutes.
app.get('/robots.txt', (c) => {
	c.header('Cache-Control', BRIEFLY);
	return c.text(robotsTxt({ disallow: [''] }));
});

// Every type in `PUBLIC_TYPES` is reachable, and this is the one place that says how. Three have
// logic of their own: `image` decodes and re-encodes, `license` also answers for a named
// aggregate, and `opengraph` is addressed by slug rather than by hash. The rest are the same
// lookup, so they are mounted from the table rather than written out, which is what stops a new
// type from being added and quietly having no route. `index.test.ts` fails if one is.
app.route('/favicon', favicon);
app.route('/image', image);
app.route('/github', github);
app.route('/license', license);
app.route('/opengraph', opengraph);
export const PLAIN_OBJECTS = ['captions', 'video'] as const;
for (const type of PLAIN_OBJECTS) {
	// One extension each, which is what makes them plain. Read off the table rather than written
	// here, so a second format arriving for either is a failure at this line and not a silent
	// half-served type.
	const [extension, ...rest] = PUBLIC_TYPES[type];
	if (rest.length > 0) throw new Error(`${type} stores more than one format`);
	app.route(`/${type}`, stored(type, extension));
}

// The published corpus, mounted from `ARTIFACT_TYPES` for the reason the table above is: a type
// added to @canmi/artifacts must not be able to arrive with no route to reach it by. Each is the
// same lookup -- the path is already the key -- and none of them names a lifetime.
for (const type of ARTIFACT_TYPES) {
	app.route(`/${type}`, artifact(type));
}

/**
 * The font chunks, which are named rather than addressed by content.
 *
 * The one prefix left that earns a year without a hash to justify it, on the written promise that
 * re-subsetting produces a new filename. Declared rather than reached through a catch-all: a
 * catch-all is what served the records for as long as they shared this bucket, because it answers
 * for whatever happens to be there rather than for what this host is meant to hold.
 */
app.get('/fonts/*', async (c) => {
	const key = new URL(c.req.url).pathname.replace(/^\/+/, '');
	if (key.includes('..')) {
		return failure(c, 400, 'not_an_address');
	}
	const found = await read(c.env, key, c.req.header('Range'));
	if (!found) {
		return failure(c, 404, 'not_found');
	}
	if (isUnsatisfiable(found)) {
		return unsatisfiableResponse(found.total);
	}
	return toResponse(found);
});

/**
 * A request this worker has no route for, said in the envelope every refusal here uses.
 *
 * The `GET /*` above catches every readable path, so what reaches this is a method the bucket
 * cannot answer -- a POST, a PUT. Hono's own answer is `text/plain`, which is the one shape a
 * caller reading JSON cannot read. The lifetime is the middleware's: a non-2xx is held for five
 * minutes at most, and that rule is derived from the response rather than restated here. See
 * spec/architecture/delivery.md.
 */
app.notFound((c) => failure(c, 404, 'no_such_route'));

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

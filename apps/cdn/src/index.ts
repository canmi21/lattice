import { ARTIFACT_TYPES } from '@canmi/artifacts';
import { robotsTxt } from '@canmi/robots';
import { isDevHost, pickUrls } from '@canmi/urls';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { artifact } from './artifact';
import { BRIEFLY, cacheControl } from './cache';
import favicon from './favicon';
import image from './image';
import github from './github';
import license from './license';
import opengraph from './opengraph';
import {
	OBJECTS,
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

app.get('/', (c) => {
	const urls = pickUrls(isDevHost(new URL(c.req.url).hostname));
	return c.redirect(`${urls.site}/?ref=cdn`, 302);
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

// Every content-addressed kind in `OBJECTS` is reachable, and this is the one place that says
// how. Three have logic of their own: `image` decodes and re-encodes, `license` also answers for
// a named aggregate, and `meta` is not served from here at all -- apps/api reads it. The rest are
// the same lookup, so they are mounted from the table rather than written out, which is what
// stops a new kind from being added to the store and quietly having no route. `index.test.ts`
// fails if one is.
app.route('/favicon', favicon);
app.route('/image', image);
app.route('/github', github);
app.route('/license', license);
app.route('/opengraph', opengraph);
export const PLAIN_OBJECTS = ['captions', 'video'] as const;
for (const prefix of PLAIN_OBJECTS) {
	const extension = OBJECTS[prefix].extension;
	// `satisfies` cannot say this: the table allows a null extension and these entries do not
	// have one. Asserted rather than assumed, so moving `image` into this list fails here.
	if (extension) app.route(`/${prefix}`, stored(prefix, extension));
}

// The published corpus, mounted from `ARTIFACT_TYPES` for the reason the table above is: a type
// added to @canmi/artifacts must not be able to arrive with no route to reach it by. Each is the
// same lookup -- the path is already the key -- and none of them names a lifetime.
for (const type of ARTIFACT_TYPES) {
	app.route(`/${type}`, artifact(type));
}

// Everything else is a direct key lookup: fonts, the site's own icons, whatever else lands in
// data/public. The path is the key, because the bucket mirrors that directory exactly.
app.get('/*', async (c) => {
	const key = new URL(c.req.url).pathname.replace(/^\/+/, '');
	if (!key || key.includes('..')) {
		return failure(c, 404, 'not_found');
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

export default app;

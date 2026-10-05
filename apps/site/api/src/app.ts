import { PUBLISHED } from '@monoflake/sdk/cache';
import { counted, limited } from '@monoflake/sdk/limits';
import { URLS } from '@monoflake/sdk';
import { poweredBy } from '@canmi/web/disclose/hono';
import { Hono } from 'hono';
import type { Bindings } from './bindings';
import batch from './handlers/batch';
import corpus from './handlers/corpus';
import engagement from './handlers/engagement';
import { failure } from './lib/respond';
import media from './handlers/media';
import trust from './handlers/trust';
import { requireTrust } from './lib/trust';
import { LIMITS } from './contract/limits';

/**
 * The site's JSON API, which the site's own Worker serves: its pages under `/api/`, and the public
 * routes through the gateway. Which request reaches which route is the Worker's to decide; this is
 * the routes and nothing else. See platform's spec/architecture/services.md, "The site's API runs
 * in the site's Worker".
 */
const app = new Hono<{ Bindings: Bindings }>();

// First, so every answer says what made it. See lib's spec/web/disclose.md.
app.use(poweredBy());

/** The public API host. A request naming it came through the gateway, which counted it already. */
const API_HOST = new URL(URLS.apps.production.api).hostname;

// Limits first, so a request over its allowance never reaches a handler. A call is counted once, by
// the door it entered: the gateway's own rows for what it passes on, these for the pages'. See
// platform's spec/architecture/quota.md, "Deployed twice, counted where a request enters".
app.use('*', async (c, next) => {
	if (new URL(c.req.url).hostname === API_HOST) return next();
	const taken = await counted(c.env.QUOTA, 'site', LIMITS, {
		method: c.req.method,
		path: c.req.path,
		address: c.req.header('CF-Connecting-IP') || undefined,
	});
	return taken.allowed ? next() : limited(taken);
});

// After the limits, so a refused write is counted; before every route, so none writes unchecked.
// See spec/architecture/trust.md.
app.use('*', requireTrust);

app.route('/', media);
app.route('/', corpus);
app.route('/', batch);
app.route('/', engagement);
app.route('/', trust);

/**
 * A route that does not exist says so in the envelope, like every other refusal.
 *
 * Without this, hono answers `text/plain` and a caller parsing JSON gets a syntax error instead of
 * a message -- which is what asking for `GET /batch` looked like, that route being POST-only. The
 * envelope is the whole point of having one: a consumer reads one shape whether the refusal came
 * from a handler or from never reaching one. Five minutes, because which routes exist changes when
 * this worker is deployed and not before. See platform's spec/architecture/artifacts.md.
 */
app.notFound((c) => failure(c, 404, 'no_such_route', { 'Cache-Control': PUBLISHED }));

/**
 * A failure is JSON and is never stored, however far up it was thrown.
 *
 * Five minutes on "the API failed" would turn a blip into an outage -- see platform's
 * spec/architecture/artifacts.md. Logged rather than reported: the site's error reporter wraps the
 * Worker around this app and cannot see what is handled here.
 */
app.onError((error, c) => {
	console.error(error);
	return failure(c, 500, 'service_unavailable', { 'Cache-Control': 'no-store' });
});

export default app;

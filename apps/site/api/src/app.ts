import { PUBLISHED } from '@canmi/cache';
import { limited, within } from '@canmi/limits';
import { Hono } from 'hono';
import type { Bindings } from './bindings';
import batch from './batch';
import corpus from './corpus';
import engagement from './engagement';
import { failure } from './respond';
import image from './image';
import { LIMITS } from './limits';

/**
 * The site's JSON API, which the site's own Worker serves: its pages under `/api/`, and the public
 * routes through the gateway. Which request reaches which route is the Worker's to decide; this is
 * the routes and nothing else. See spec/architecture/services.md, "The site's API runs in the
 * site's Worker".
 */
const app = new Hono<{ Bindings: Bindings }>();

// Limits first, so a request over its allowance never reaches a handler.
app.use('*', async (c, next) => {
	const request = {
		method: c.req.method,
		path: c.req.path,
		address: c.req.header('CF-Connecting-IP') || undefined,
	};
	if (!(await within(LIMITS, c.env, request))) return limited();
	return next();
});

app.route('/', image);
app.route('/', corpus);
app.route('/', batch);
app.route('/', engagement);

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
 * spec/architecture/artifacts.md. Logged rather than reported: the site's error reporter wraps
 * the Worker around this app and cannot see what is handled here.
 */
app.onError((error, c) => {
	console.error(error);
	return failure(c, 500, 'service_unavailable', { 'Cache-Control': 'no-store' });
});

export default app;

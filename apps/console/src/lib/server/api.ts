/**
 * The console's own API under `/api/`, a Hono app as the site's is: the facets and the live
 * stream, each at the address ../facets.ts asks it at, and whatever the console answers itself
 * after them. See spec/architecture/console.md, "A component asks for its facet".
 */
import { routeOf } from '@canmi/addresses';
import { failure, success } from '@canmi/response';
import { poweredBy } from '@canmi/web/disclose/hono';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { ASKED, PREFIX } from '../facets.ts';
import { served } from '../ui/time-zone.ts';
import type { Env } from './edge.ts';
import { FACETS, type FacetName, STREAMS, type StreamName } from './facets.ts';
import type { Whereabouts } from './nodes.ts';
import { sourcesOf } from './sources.ts';
import { dev } from '$app/env';
import { asksFresh, storeOf } from './cache.ts';

const app = new Hono<{ Bindings: Env }>();

// First, so every answer says what made it. See lib's spec/web/disclose.md.
app.use(poweredBy());

app.get(`${PREFIX}*`, async (c) => {
	const asked = routeOf(ASKED, c.req.path.slice(PREFIX.length));
	if (!asked) return failure(404, 'no_such_route');
	if (asked.route in STREAMS) return STREAMS[asked.route as StreamName].open(c.req.raw, c.env);
	const facet = FACETS[asked.route as FacetName];
	const params = facet.params({ ...c.req.query(), ...asked.query });
	if (!params) return failure(400, 'invalid_route');
	const where = c.req.raw.cf as Whereabouts | undefined;
	const context = {
		sources: sourcesOf(c.req.raw, {
			env: c.env,
			where,
			store: storeOf(dev, new URL(c.req.url).origin),
			fresh: asksFresh(c.req.raw),
		}),
		zone: served(
			{ get: (name) => getCookie(c, name) },
			c.req.raw.cf as { timezone?: string } | undefined,
		),
		now: Date.now(),
	};
	// Each facet's own parameters, checked by its `params` just above.
	return success(await facet.read(context, params as never));
});

app.all('*', () => failure(404, 'no_such_route'));

export default app;

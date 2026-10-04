/**
 * The gateway as deployed at home: the same app, handed over HTTP what the Worker has by binding.
 * `HOME` and `QUOTA` are asked on Caddy's inside side with the token; `RELAY` is the public
 * gateway, its name resolved by public DNS, so a LAN that answers the gateway's names locally
 * never sends it back here. See spec/architecture/gateway.md, "Inside the house, the same names
 * answer locally".
 */
import { Resolver } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { serve } from '@hono/node-server';
import type { Check, Taken } from '@monoflake/limits';
import { gateway, INTERNAL_HEADER } from './index.ts';
import { profileOf } from './profile.ts';
import { send, type Target } from './send.ts';

const token = process.env.INTERNAL_TOKEN ?? '';
const port = Number(process.env.PORT ?? 26512);

/** Caddy's inside side, and the name it answers there. See spec/architecture/host.md. */
const INSIDE: Target = {
	origin: `http://${process.env.CADDY_INSIDE ?? 'caddy:8080'}`,
	host: 'api.inside',
	headers: { [INTERNAL_HEADER]: token },
};

/** Cloudflare's resolvers, asked for the public gateway's address whatever the LAN answers. */
const PUBLIC_DNS = ['1.1.1.1', '1.0.0.1'];
const resolver = new Resolver();
resolver.setServers(PUBLIC_DNS);

const publicLookup: LookupFunction = (hostname, options, callback) => {
	resolver.resolve4(hostname, (error, addresses) => {
		const [first] = addresses ?? [];
		if (error || first === undefined) {
			callback(error ?? new Error(`no address for ${hostname}`), '', 4);
			return;
		}
		if (options.all) {
			(callback as unknown as (e: null, all: { address: string; family: number }[]) => void)(
				null,
				addresses.map((address) => ({ address, family: 4 })),
			);
			return;
		}
		callback(null, first, 4);
	});
};

const RELAY = {
	fetch: (request: Request) => send(request, { origin: request.url, lookup: publicLookup }),
};
const HOME = { fetch: (request: Request) => send(request, INSIDE) };
const QUOTA = {
	async take(checks: readonly Check[]): Promise<Taken> {
		const asked = new Request(new URL('/quota/take', INSIDE.origin), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(checks),
		});
		const answer = await send(asked, INSIDE);
		if (!answer.ok) throw new Error(`quota answered ${answer.status}`);
		return (await answer.json()) as Taken;
	},
};

const env = { HOME, QUOTA, RELAY, INTERNAL_TOKEN: token };
const app = gateway();

serve({
	port,
	hostname: '::',
	fetch(request) {
		const url = new URL(request.url);
		// host asks its health by the container's name, which no profile reads.
		if (url.pathname === '/health' && !profileOf(url.hostname)) return new Response('ok');
		return app.fetch(request, env);
	},
});

/**
 * A request sent over Node's own HTTP, for the deployments at home: unlike `fetch`, it names the
 * `Host` it asks for, and can resolve a name by a resolver of its choosing. See
 * spec/architecture/gateway.md, "Inside the house, the same names answer locally".
 */
import type { LookupFunction } from 'node:net';
import { request as overHttp } from 'node:http';
import { request as overHttps } from 'node:https';
import { Readable } from 'node:stream';

/** Where a request goes, and what it is sent as. */
export interface Target {
	/** Scheme, host and port the connection is made to; the request's path and query follow. */
	readonly origin: string;
	/** The `Host` asked for, where it is not the origin's own. */
	readonly host?: string;
	/** Set over whatever the request carried. */
	readonly headers?: Readonly<Record<string, string>>;
	/** How the origin's name becomes an address; the system's when absent. */
	readonly lookup?: LookupFunction;
}

/** Hop-by-hop headers, which belong to one connection and are not passed on. */
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host']);

/** `request` sent to `target`, answered as a `Response`. */
export function send(request: Request, target: Target): Promise<Response> {
	const asked = new URL(request.url);
	const url = new URL(`${asked.pathname}${asked.search}`, target.origin);
	const headers: Record<string, string> = {};
	for (const [name, value] of request.headers) if (!HOP.has(name)) headers[name] = value;
	Object.assign(headers, target.headers, { host: target.host ?? url.host });
	const open = url.protocol === 'https:' ? overHttps : overHttp;
	return new Promise((resolve, reject) => {
		const outgoing = open(
			url.toString(),
			{
				method: request.method,
				headers,
				...(target.lookup ? { lookup: target.lookup } : {}),
				...(url.protocol === 'https:' ? { servername: target.host ?? url.hostname } : {}),
			},
			(incoming) => {
				const status = incoming.statusCode ?? 502;
				const answered = new Headers();
				const raw = incoming.rawHeaders;
				for (let index = 0; index + 1 < raw.length; index += 2) {
					const name = (raw[index] as string).toLowerCase();
					if (!HOP.has(name)) answered.append(name, raw[index + 1] as string);
				}
				const bodiless = request.method === 'HEAD' || status === 204 || status === 304;
				const body = bodiless ? null : (Readable.toWeb(incoming) as unknown as ReadableStream);
				if (bodiless) incoming.resume();
				resolve(new Response(body, { status, headers: answered }));
			},
		);
		outgoing.on('error', reject);
		if (request.body) {
			const stream = request.body as unknown as import('node:stream/web').ReadableStream;
			Readable.fromWeb(stream).pipe(outgoing);
		} else {
			outgoing.end();
		}
	});
}

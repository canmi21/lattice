/**
 * host, as the panel's server reaches it: on the network the two share and nothing else joins,
 * with the visitor's own token, since the panel holds none. See spec/architecture/host.md, "The
 * panel is an app of its own".
 */
import { dev } from '$app/env';
import { HOST_API, HOST_TOKEN } from '$app/env/private';
import { INFRA } from '@monoflake/urls';
import type { ApiResponse } from '@canmi/response';

/** The session cookie host sets, which is the token itself. */
export const SESSION = 'host_token';

/**
 * Where host answers. In development there is no host beside the panel, so it asks the running
 * panel on the machine, which passes the request on as it passes on any other.
 */
export const CORE = HOST_API || (dev ? INFRA.panel : INFRA.host);

/** In development only: the token mise decrypts, so a development panel reads a real host. */
const DEVELOPMENT_TOKEN = dev ? HOST_TOKEN : undefined;

/** Headers a request carries on to host, and nothing else of what the browser sent. */
const CARRIED = ['accept', 'content-type', 'authorization'];

/** Headers an answer carries back. Encoding and length are fetch's, which decodes the body. */
const RETURNED = [
	'content-type',
	'cache-control',
	'retry-after',
	'content-disposition',
	'location',
];

function headersFor(request: Request, token: string | undefined): Headers {
	const headers = new Headers();
	for (const name of CARRIED) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const bearer = token ?? DEVELOPMENT_TOKEN;
	if (!headers.has('authorization') && bearer) headers.set('authorization', `Bearer ${bearer}`);
	return headers;
}

/** Pass a request on to host as it came, and host's answer back as it went. */
export async function forward(
	request: Request,
	url: URL,
	token: string | undefined,
): Promise<Response> {
	const target = new URL(`${url.pathname}${url.search}`, CORE);
	const init: RequestInit & { duplex?: 'half' } = {
		method: request.method,
		headers: headersFor(request, token),
		redirect: 'manual',
	};
	// An upload is streamed through rather than held: an image archive is hundreds of megabytes.
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		init.body = request.body;
		init.duplex = 'half';
	}
	let answer: Response;
	try {
		answer = await fetch(target, init);
	} catch {
		const body = { status: 'error', code: 'upstream_unavailable', message: 'host did not answer' };
		return Response.json(body, { status: 502 });
	}
	const headers = new Headers();
	for (const name of RETURNED) {
		const value = answer.headers.get(name);
		if (value) headers.set(name, value);
	}
	for (const cookie of answer.headers.getSetCookie()) headers.append('set-cookie', cookie);
	return new Response(answer.body, { status: answer.status, headers });
}

/** Signed out: the token is missing or host refuses it. */
export class SignedOut extends Error {}

/** What host answers a GET with, for a page rendered on the server. */
export async function read<T>(path: string, token: string | undefined): Promise<T> {
	if (!token && !DEVELOPMENT_TOKEN) throw new SignedOut();
	const request = new Request(new URL(path, CORE));
	const answer = await fetch(new URL(path, CORE), { headers: headersFor(request, token) });
	if (answer.status === 401) throw new SignedOut();
	const envelope = (await answer.json()) as ApiResponse<T>;
	if (envelope.status !== 'success') throw new Error(envelope.message);
	return envelope.data;
}

/** What host answers, or nothing when it cannot be read: the page then asks from the browser. */
export async function tryRead<T>(path: string, token: string | undefined): Promise<T | undefined> {
	return read<T>(path, token).catch(() => undefined);
}

/**
 * The `live` stream under `vite dev`, which hands every upgrade to its own HMR server and never to
 * src/hooks.server.ts. The browser's socket is joined to the one src/lib/server/edge.ts opens
 * through the nearest node's binding, the remote VPC binding the pages read through, so the relay
 * at the other end is the real one. Loaded by vite.config.ts while serving alone; the Worker never
 * carries it.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { ViteDevServer } from 'vite';
import { type WebSocket, WebSocketServer } from 'ws';

/** The relay's side, the socket a binding's `fetch` hands back. */
interface Relay {
	accept(): void;
	send(data: string | ArrayBufferView): void;
	close(code?: number, reason?: string): void;
	addEventListener(
		type: 'message',
		listener: (event: { data: string | ArrayBuffer }) => void,
	): void;
	addEventListener(
		type: 'close',
		listener: (event: { code: number; reason: string }) => void,
	): void;
}

/** What the adapter keeps of `getPlatformProxy` while serving: the bindings, and where `cf` says
 * this machine is. */
interface Platform {
	env: unknown;
	cf: unknown;
}

export function live(server: ViteDevServer): void {
	const browsers = new WebSocketServer({ noServer: true });
	server.httpServer?.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
		// Development asks the stream at its name; see src/lib/facets.ts.
		if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/api/live') return;
		if (!admitted(request.headers.origin, portOf(server))) {
			socket.write('HTTP/1.1 403 Forbidden\r\nconnection: close\r\n\r\n');
			socket.destroy();
			return;
		}
		join(server, browsers, request, socket, head).catch((error: unknown) => {
			console.error(`live: ${String(error)}`);
			socket.destroy();
		});
	});
}

/**
 * Whether a socket may open from `origin`: a page this dev server served, and nothing else -- not
 * another site open in the same browser, and not a client naming no page. Production's relay asks
 * the same of its own `.app`; see src/lib/server/edge.ts.
 */
export function admitted(origin: string | undefined, port: number | undefined): boolean {
	if (port === undefined) return false;
	return origin === `http://localhost:${port}`;
}

/** The port the server is listening on, which `--port` without `--strictPort` may have moved. */
function portOf(server: ViteDevServer): number | undefined {
	const address = server.httpServer?.address();
	return typeof address === 'object' && address !== null ? address.port : server.config.server.port;
}

async function join(
	server: ViteDevServer,
	browsers: WebSocketServer,
	request: IncomingMessage,
	socket: Duplex,
	head: Buffer,
): Promise<void> {
	const platform = (globalThis as { __sveltekit_cloudflare_platform?: Platform })
		.__sveltekit_cloudflare_platform;
	if (platform === undefined) throw new Error('no platform proxy yet');
	const { socketOf } = await server.ssrLoadModule('/src/lib/server/edge.ts');
	const { order } = await server.ssrLoadModule('/src/lib/server/nodes.ts');
	// No `Origin`: the binding's local end refuses an upgrade from a page on another host, and
	// localhost is one; the relay admits a socket that names none.
	const upgrade = new Request('http://localhost/live', { headers: { upgrade: 'websocket' } });
	const relay = (await socketOf(upgrade, platform.env, order(platform.cf))) as Relay | undefined;
	if (relay === undefined) {
		socket.end('HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\n\r\n');
		return;
	}
	browsers.handleUpgrade(request, socket, head, (browser) => couple(browser, relay));
}

/** Each side's messages to the other, and either one's close to both. */
function couple(browser: WebSocket, relay: Relay): void {
	relay.accept();
	relay.addEventListener('message', (event) => browser.send(event.data));
	relay.addEventListener('close', (event) => browser.close(sendable(event.code), event.reason));
	// A `Buffer` either way: `binaryType` is left at its `nodebuffer`.
	browser.on('message', (data: Buffer, binary) => relay.send(binary ? data : data.toString()));
	browser.on('close', (code, reason) => {
		try {
			relay.close(sendable(code), reason.toString());
		} catch {
			// Closed from the relay's side first.
		}
	});
}

/** 1005 and 1006 are reported, never sent. */
function sendable(code: number): number {
	return code === 1005 || code === 1006 ? 1000 : code;
}

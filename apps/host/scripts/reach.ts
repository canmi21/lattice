/**
 * `mise run reach [name]`: answer on `http://localhost:REACH_PORT` for `<name>.canmi.icu`, which
 * only the LAN reaches -- `host` when no name is given. For a browser this machine refuses the
 * local network to, which still reaches localhost. See spec/toolchain.md, "Reaching the LAN from
 * a browser that cannot".
 *
 * Two hops. ssh, being the system's own, is let onto the LAN and carries the node's port 443 to a
 * loopback port; node, which macOS refuses the LAN until somebody grants it, only ever talks to
 * that loopback port. Over it every request is sent as the name would be -- TLS with the name as
 * SNI and as `Host` -- so Caddy routes it, and its guard sees a LAN address, the node's own.
 */
import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { request as plain, createServer, type IncomingHttpHeaders } from 'node:http';
import { request as secure } from 'node:https';
import { createServer as createProbe } from 'node:net';
import { REACH_PORT, URLS } from '@canmi/urls';

const HOME = new URL(URLS.internal.home).hostname;
const SUFFIX = HOME.slice(HOME.indexOf('.') + 1);
const name = process.argv[2] ?? 'host';
if (!/^[a-z0-9-]+$/.test(name)) {
	console.error('usage: reach [name]');
	process.exit(1);
}
const TARGET = `${name}.${SUFFIX}`;
const ORIGIN = `https://${TARGET}`;
const LOCAL = `http://localhost:${REACH_PORT}`;

/** A loopback port nobody holds, for ssh's end of the tunnel. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createProbe();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject()));
		});
	});
}

/** Waits until ssh has bound its end, or gives up; a tunnel that never came up is an error. */
async function listening(port: number, deadline: number): Promise<void> {
	while (Date.now() < deadline) {
		const open = await new Promise<boolean>((resolve) => {
			const probe = plain({ host: '127.0.0.1', port, method: 'HEAD', timeout: 500 });
			probe.on('response', () => resolve(true));
			probe.on('error', (error: NodeJS.ErrnoException) => resolve(error.code !== 'ECONNREFUSED'));
			probe.on('timeout', () => probe.destroy());
			probe.end();
		});
		if (open) return;
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error('the tunnel did not come up');
}

/** What the browser sent, as the name's own origin would have. */
function outbound(headers: IncomingHttpHeaders): IncomingHttpHeaders {
	const rewritten: IncomingHttpHeaders = { ...headers, host: TARGET };
	if (headers.origin) rewritten.origin = ORIGIN;
	if (headers.referer) rewritten.referer = headers.referer.replace(LOCAL, ORIGIN);
	return rewritten;
}

/** What came back, pointed at this door. A `Secure` cookie stays as it is: localhost is secure. */
function inbound(headers: IncomingHttpHeaders): IncomingHttpHeaders {
	const rewritten = { ...headers };
	if (headers.location?.startsWith(ORIGIN)) rewritten.location = LOCAL + headers.location.slice(ORIGIN.length);
	return rewritten;
}

// By address, which is what the node's key is known under; the name is public DNS for it.
const { address: node } = await lookup(HOME, { family: 4 });
const tunnelPort = await freePort();
const ssh = spawn(
	'ssh',
	['-N', '-o', 'ExitOnForwardFailure=yes', '-L', `127.0.0.1:${tunnelPort}:${node}:443`, `root@${node}`],
	{ stdio: ['ignore', 'inherit', 'inherit'] },
);
ssh.on('exit', (code) => {
	console.error(`reach: ssh exited with ${code}`);
	process.exit(1);
});
process.on('SIGINT', () => ssh.kill());
process.on('SIGTERM', () => ssh.kill());
await listening(tunnelPort, Date.now() + 15_000);

createServer((incoming, outgoing) => {
	const forwarded = secure(
		{
			host: '127.0.0.1',
			port: tunnelPort,
			servername: TARGET,
			method: incoming.method,
			path: incoming.url,
			headers: outbound(incoming.headers),
		},
		(answer) => {
			outgoing.writeHead(answer.statusCode ?? 502, inbound(answer.headers));
			answer.pipe(outgoing);
		},
	);
	forwarded.on('error', (error) => {
		if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'text/plain' });
		outgoing.end(`reach: ${error.message}\n`);
	});
	incoming.pipe(forwarded);
}).listen(REACH_PORT, '::', () => console.log(`reach: ${LOCAL} -> ${ORIGIN}`));

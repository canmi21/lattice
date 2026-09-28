/**
 * The flags `wrangler dev` needs to run in the sandbox, printed for a dev task to pass on, and
 * nothing outside it: there the pinned port in each wrangler.jsonc is already right.
 *
 * wrangler reads neither this library nor the environment for a port, so the shifted number and
 * the shift itself are handed to it here -- the port and its inspector, and the offset stated to
 * a worker that has no environment to read it from. See spec/architecture/modes.md.
 */
import { DEVELOPMENT_PORTS, DEVELOPMENT_SERVICE_PORTS, PORT_OFFSET } from '../src/index.ts';

const ports: Readonly<Record<string, number>> = {
	...DEVELOPMENT_PORTS,
	...DEVELOPMENT_SERVICE_PORTS,
};
const app = process.argv[2] ?? '';
const port = ports[app];
if (port === undefined) throw new Error(`not an app with a dev port: ${app}`);
if (PORT_OFFSET !== 0) {
	console.log(
		`--port ${port} --inspector-port ${port + 1} --define STATED_PORT_OFFSET:${PORT_OFFSET}`,
	);
}

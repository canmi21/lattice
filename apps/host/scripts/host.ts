/**
 * `mise run host deploy <name>`: build an app's image for the machine at home and hand it, with
 * its declaration, to host there -- or, for host itself, to keeper, since host never replaces
 * itself. Over the LAN or the tailnet, never the tunnel.
 * `image <name> <path>` only builds the archive, which is how host itself is first carried over.
 * See spec/architecture/host.md, "The machine pulls; nothing pushes into it".
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URLS } from '@canmi/urls';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const USAGE = 'usage: host deploy <name> | host image <name> <path>';

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

/** The one build, shared with CI; see .mise/tasks/image. */
function build(name: string, archive: string): void {
	if (!existsSync(join(ROOT, 'apps', name, 'Dockerfile'))) fail(`apps/${name} has no Dockerfile`);
	execFileSync(join(ROOT, '.mise/tasks/image'), [name, archive], { cwd: ROOT, stdio: 'inherit' });
}

/**
 * Through curl rather than fetch: macOS asks before a program reaches the local network, and
 * node from mise is refused with EHOSTUNREACH until somebody grants it, while curl, being the
 * system's own, is never asked. The token goes in on stdin so it never shows in `ps`.
 */
function upload(name: string, declaration: string, archive: string, token: string): boolean {
	// keeper takes host at its own address; host takes every other app under its API, which the
	// panel passes on.
	const receiver = name === 'host' ? URLS.internal.keeper : URLS.internal.panel;
	const address = name === 'host' ? `${receiver}/apps/host` : `${receiver}/api/apps/${name}`;
	console.log(`handing ${name} to ${receiver}`);
	const sent = spawnSync(
		'curl',
		[
			'--silent',
			'--show-error',
			'--header',
			'@-',
			'--form',
			`service=@${declaration}`,
			'--form',
			`image=@${archive}`,
			'--write-out',
			'\n%{http_code}',
			address,
		],
		{ input: `authorization: Bearer ${token}\n`, encoding: 'utf8' },
	);
	const lines = `${sent.stdout}`.trimEnd().split('\n');
	const status = Number(lines.pop());
	console.log(lines.join('\n'));
	if (sent.stderr) console.error(sent.stderr.trimEnd());
	return status >= 200 && status < 300;
}

function deploy(name: string): void {
	const token = process.env.HOST_TOKEN ?? fail('HOST_TOKEN is not set; it comes from secrets.json');
	const declaration = join(ROOT, 'apps', name, 'service.toml');
	if (!existsSync(declaration)) fail(`apps/${name} has no service.toml`);
	const scratch = mkdtempSync(join(tmpdir(), 'host-'));
	try {
		const archive = join(scratch, `${name}.tar`);
		build(name, archive);
		if (!upload(name, declaration, archive, token)) process.exitCode = 1;
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

const [verb, name, path] = process.argv.slice(2);
if (verb === 'deploy' && name) deploy(name);
else if (verb === 'image' && name && path) build(name, resolve(path));
else fail(USAGE);

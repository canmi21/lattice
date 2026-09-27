/**
 * `mise run host deploy <name>`: build an app's image for the machine at home and hand it, with
 * its declaration, to host there -- over the LAN or the tailnet, never the tunnel.
 * `image <name> <path>` only builds the archive, which is how host itself is first carried over.
 * See spec/architecture/host.md, "The machine pulls; nothing pushes into it".
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, openAsBlob, readFileSync, rmSync } from 'node:fs';
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

/** The compiler every local check runs, as rustup resolves it from the toolchain file. */
function rustVersion(): string {
	const [, version] = execFileSync('rustc', ['--version'], { cwd: ROOT, encoding: 'utf8' }).split(' ');
	return version ?? fail('rustc printed no version');
}

/** The machine at home is arm64, and so is the Mac this runs on, so nothing is emulated. */
function build(name: string, archive: string): void {
	const dockerfile = join(ROOT, 'apps', name, 'Dockerfile');
	if (!existsSync(dockerfile)) fail(`apps/${name} has no Dockerfile`);
	execFileSync(
		'docker',
		[
			'buildx',
			'build',
			'--platform',
			'linux/arm64',
			'--file',
			dockerfile,
			'--build-arg',
			`RUST_VERSION=${rustVersion()}`,
			'--tag',
			`${name}:local`,
			'--output',
			`type=docker,dest=${archive}`,
			'.',
		],
		{ cwd: ROOT, stdio: 'inherit' },
	);
}

async function deploy(name: string): Promise<void> {
	const token = process.env.HOST_TOKEN ?? fail('HOST_TOKEN is not set; it comes from secrets.json');
	const declaration = join(ROOT, 'apps', name, 'service.toml');
	if (!existsSync(declaration)) fail(`apps/${name} has no service.toml`);
	const scratch = mkdtempSync(join(tmpdir(), 'host-'));
	try {
		const archive = join(scratch, `${name}.tar`);
		build(name, archive);
		const form = new FormData();
		form.append('service', new Blob([readFileSync(declaration)]), 'service.toml');
		form.append('image', await openAsBlob(archive), `${name}.tar`);
		console.log(`handing ${name} to ${URLS.internal.home}`);
		const response = await fetch(`${URLS.internal.home}/apps/${name}`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}` },
			body: form,
		});
		const body = await response.text();
		console.log(`${response.status} ${body}`);
		if (!response.ok) process.exitCode = 1;
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

const [verb, name, path] = process.argv.slice(2);
if (verb === 'deploy' && name) await deploy(name);
else if (verb === 'image' && name && path) build(name, resolve(path));
else fail(USAGE);

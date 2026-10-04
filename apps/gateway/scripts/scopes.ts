import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GATEWAY_HOSTS, GATEWAY_NAMES } from '@monoflake/sdk';
import { renderScopes, scopeTable } from '../src/table.ts';

const ROOT = join(import.meta.dirname, '../../..');
/** Where an app's directory sits: `apps/` until it moves under its layer. See graph.py. */
const APP_ROOTS = ['apps', 'infra/apps', 'platform/apps', 'services/apps'].map((root) =>
	join(ROOT, root),
);
const SCOPES = join(import.meta.dirname, '../src/scopes.ts');
const DECLARATION = join(import.meta.dirname, '../service.toml');

/** The first line of the `[edge]` block this script owns at the foot of the declaration. */
const EDGE_MARK =
	"# Written by `mise run scopes` from @monoflake/sdk's gateway names; do not edit.";

/**
 * The names the gateway claims at home, as its declaration states them for host: the hosts Caddy
 * routes to it and certifies, the names the resolver answers exactly, and the zone deployments are
 * spelled under. From the sdk, so a name is still written once. See spec/architecture/host.md, "A
 * role is asked for by the app and granted by the node".
 */
export function renderEdge(): string {
	const list = (items: readonly string[]) => `[${items.map((item) => `"${item}"`).join(', ')}]`;
	const { exact, deployments } = GATEWAY_NAMES;
	return [
		EDGE_MARK,
		'# Claimed only where the node grants the gateway `hosts`.',
		'[edge]',
		`hosts = ${list(GATEWAY_HOSTS)}`,
		`names = ${list(exact)}`,
		`deployments = { zone = "${deployments.zone}", regions = ${list(deployments.regions)}, providers = ${list(deployments.providers)} }`,
		'',
	].join('\n');
}

/** `declaration` with its `[edge]` block written from the sdk, in place of any it had. */
export function withEdge(declaration: string): string {
	const at = declaration.indexOf(EDGE_MARK);
	const kept = (at === -1 ? declaration : declaration.slice(0, at)).trimEnd();
	return `${kept}\n\n${renderEdge()}`;
}

/** Every app's declaration, as text. Shared with the test that holds the committed table to it. */
export function declarations(): string[] {
	const apps = APP_ROOTS.flatMap((root) => {
		try {
			return readdirSync(root).map((app) => ({ app, root }));
		} catch {
			return [];
		}
	});
	apps.sort((a, b) => a.app.localeCompare(b.app));
	return apps.flatMap(({ app, root }) => {
		try {
			return [readFileSync(join(root, app, 'service.toml'), 'utf8')];
		} catch {
			return [];
		}
	});
}

/**
 * `source` as oxfmt would leave it. Written beside the real file, under the name `mise run
 * scopes` never uses, so the same config oxfmt would find for `scopes.ts` applies here too;
 * removed again whether formatting succeeds or throws.
 */
export function formatted(source: string): string {
	const scratch = join(import.meta.dirname, '../src/scopes.check.ts');
	writeFileSync(scratch, source);
	try {
		execFileSync('pnpm', ['exec', 'oxfmt', scratch], { cwd: ROOT, stdio: 'pipe' });
		return readFileSync(scratch, 'utf8');
	} finally {
		rmSync(scratch);
	}
}

/**
 * Whether the committed `src/scopes.ts` disagrees with every `service.toml`, formatting
 * included, without ever writing to it. See spec/architecture/services.md, "One API host, scoped
 * by path".
 */
export function stale(): boolean {
	const table = renderScopes(scopeTable(declarations()));
	return formatted(table) !== readFileSync(SCOPES, 'utf8');
}

if (import.meta.main) {
	const declaration = readFileSync(DECLARATION, 'utf8');
	if (process.argv.includes('--check')) {
		if (stale()) {
			console.error('apps/gateway/src/scopes.ts is stale; run `mise run scopes`');
			process.exit(1);
		}
		if (withEdge(declaration) !== declaration) {
			console.error("apps/gateway/service.toml's [edge] is stale; run `mise run scopes`");
			process.exit(1);
		}
	} else {
		writeFileSync(DECLARATION, withEdge(declaration));
		writeFileSync(SCOPES, renderScopes(scopeTable(declarations())));
	}
}

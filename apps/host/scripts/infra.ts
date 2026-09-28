/**
 * `infra <what> [app] [path] [--json]`: read the node the way an agent asks before reaching for
 * SSH -- host's inspect routes and the read-only ones beside them, each behind its token.
 * See spec/architecture/inspect.md, "`mise run infra`".
 */
import { spawnSync } from 'node:child_process';
import { URLS } from '@canmi/urls';

type Envelope<T> =
	| { status: 'success'; data: T }
	| { status: 'error'; code: string; message: string };

const WHATS = [
	'containers',
	'networks',
	'disk',
	'files',
	'env',
	'kernel',
	'apps',
	'logs',
	'history',
	'images',
	'now',
] as const;
type What = (typeof WHATS)[number];

const USAGE = `usage: infra <what> [app] [path] [--json]\nwhat: ${WHATS.join(' | ')}`;

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

/** Which of `[app] [path]` a route reads, so a missing one is caught before asking host. */
const NEEDS: Record<What, { app: boolean; path: 'sub' | 'lines' | 'none' }> = {
	containers: { app: false, path: 'none' },
	networks: { app: false, path: 'none' },
	disk: { app: false, path: 'none' },
	files: { app: true, path: 'sub' },
	env: { app: true, path: 'none' },
	kernel: { app: false, path: 'none' },
	apps: { app: false, path: 'none' },
	logs: { app: true, path: 'lines' },
	history: { app: true, path: 'none' },
	images: { app: false, path: 'none' },
	now: { app: false, path: 'none' },
};

function route(what: What, app: string | undefined, path: string | undefined): string {
	switch (what) {
		case 'containers':
			return '/api/inspect/containers';
		case 'networks':
			return '/api/inspect/networks';
		case 'disk':
			return '/api/inspect/disk';
		case 'files':
			return `/api/inspect/files/${app}${path ? `/${path}` : ''}`;
		case 'env':
			return `/api/apps/${app}/environment`;
		case 'kernel':
			return '/api/inspect/kernel';
		case 'apps':
			return '/api/apps';
		case 'logs':
			return `/api/apps/${app}/logs${path ? `?lines=${path}` : ''}`;
		case 'history':
			return `/api/apps/${app}/history`;
		case 'images':
			return '/api/images';
		case 'now':
			return '/api/node/now';
	}
}

/**
 * Through curl rather than fetch, same as `host.ts`: macOS refuses node from mise the LAN, and
 * curl, being the system's own, is never asked. The token goes in on stdin so it never shows in
 * `ps`. See apps/host/scripts/host.ts.
 */
export function fetchEnvelope(path: string, token: string): Envelope<unknown> {
	const sent = spawnSync(
		'curl',
		['--silent', '--show-error', '--header', '@-', `${URLS.internal.panel}${path}`],
		{ input: `authorization: Bearer ${token}\n`, encoding: 'utf8' },
	);
	if (sent.status !== 0) fail(sent.stderr?.trim() || `curl failed reaching ${path}`);
	try {
		return JSON.parse(sent.stdout) as Envelope<unknown>;
	} catch {
		fail(`host answered nothing readable: ${sent.stdout}`);
	}
}

/** A plain, aligned text table; padded to the widest cell in each column. */
export function table(columns: string[], rows: string[][]): string {
	if (rows.length === 0) return '(empty)';
	const widths = columns.map((column, i) =>
		Math.max(column.length, ...rows.map((row) => (row[i] ?? '').length)),
	);
	const line = (cells: string[]) =>
		cells.map((cell, i) => (cell ?? '').padEnd(widths[i] ?? 0)).join('  ');
	return [line(columns), ...rows.map(line)].join('\n');
}

function str(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map(str).join(',');
	return JSON.stringify(value);
}

/** Reads a dotted path out of an unknown value, for a field a route may or may not carry yet. */
function at(value: unknown, path: string): unknown {
	let cursor = value;
	for (const key of path.split('.')) {
		if (typeof cursor !== 'object' || cursor === null) return undefined;
		cursor = (cursor as Record<string, unknown>)[key];
	}
	return cursor;
}

function rowsOf(paths: string[], items: unknown[]): string[][] {
	return items.map((item) => paths.map((path) => str(at(item, path))));
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/** `[{name, address}]`, as containers and networks both carry it: joined `name@address`. */
function addressed(value: unknown): string {
	return list(value)
		.map((entry) => `${str(at(entry, 'name'))}@${str(at(entry, 'address'))}`)
		.join(',');
}

/** One render per `what`, each defensive about a field a route may not carry: see spec above. */
export function render(what: What, data: unknown, json: boolean): string {
	if (json) return JSON.stringify(data, null, 2);
	switch (what) {
		case 'containers': {
			const columns = [
				'name',
				'state',
				'status',
				'image',
				'memory_limit',
				'restart_count',
				'oom_killed',
				'networks',
			];
			const rows = list(data).map((item) => [
				str(at(item, 'name')),
				str(at(item, 'state')),
				str(at(item, 'status')),
				str(at(item, 'image')),
				str(at(item, 'memory_limit')),
				str(at(item, 'restart_count')),
				str(at(item, 'oom_killed')),
				addressed(at(item, 'networks')),
			]);
			return table(columns, rows);
		}
		case 'networks': {
			const columns = ['name', 'driver', 'subnet', 'members'];
			const rows = list(data).map((item) => [
				str(at(item, 'name')),
				str(at(item, 'driver')),
				str(at(item, 'subnet')),
				addressed(at(item, 'members')),
			]);
			return table(columns, rows);
		}
		case 'disk': {
			const mountColumns = ['path', 'total', 'used', 'available'];
			const mountTable = table(mountColumns, rowsOf(mountColumns, list(at(data, 'mounts'))));
			const appColumns = ['app', 'bytes', 'partial'];
			const appTable = table(appColumns, rowsOf(appColumns, list(at(data, 'apps'))));
			const snapshotColumns = ['name', 'app', 'created'];
			const snapshotTable = table(
				snapshotColumns,
				rowsOf(snapshotColumns, list(at(data, 'snapshots'))),
			);
			return `mounts\n${mountTable}\n\napps\n${appTable}\n\nsnapshots\n${snapshotTable}`;
		}
		case 'files': {
			const columns = ['name', 'kind', 'size', 'modified'];
			const paths = ['name', 'kind', 'size', 'modified'];
			return table(columns, rowsOf(paths, list(data)));
		}
		case 'env': {
			const variables = Array.isArray(at(data, 'variables'))
				? (at(data, 'variables') as unknown[])
				: undefined;
			if (variables) {
				const columns = ['name', 'type', 'value'];
				return table(columns, rowsOf(['name', 'type', 'value'], variables));
			}
			// The route as it stands before `variables` lands: config in full, secrets by name only.
			const config = at(data, 'config');
			const secrets = Array.isArray(at(data, 'secrets')) ? (at(data, 'secrets') as unknown[]) : [];
			const configRows =
				config && typeof config === 'object'
					? Object.entries(config as Record<string, unknown>).map(([name, value]) => [
							name,
							'config',
							str(value),
						])
					: [];
			const secretRows = secrets.map((name) => [str(name), 'secret', '']);
			return table(['name', 'type', 'value'], [...configRows, ...secretRows]);
		}
		case 'kernel': {
			const columns = ['task', 'pid', 'cgroup', 'monotonic_seconds'];
			const killTable = table(columns, rowsOf(columns, list(at(data, 'kills'))));
			const unavailable = at(data, 'unavailable');
			return unavailable ? `${str(unavailable)}\n\n${killTable}` : killTable;
		}
		case 'apps': {
			const columns = ['name', 'running', 'held', 'platform', 'image', 'deployed_at'];
			const paths = ['manifest.name', 'running', 'held', 'platform', 'image', 'deployed_at'];
			return table(columns, rowsOf(paths, list(data)));
		}
		case 'logs': {
			const lines = Array.isArray(at(data, 'lines')) ? (at(data, 'lines') as unknown[]) : [];
			return lines.map(str).join('\n');
		}
		case 'history': {
			const columns = ['id', 'action', 'source', 'outcome', 'started_at', 'detail'];
			const paths = ['id', 'action', 'source', 'outcome', 'started_at', 'detail'];
			return table(columns, rowsOf(paths, list(data)));
		}
		case 'images': {
			const images = Array.isArray(at(data, 'scan.images'))
				? (at(data, 'scan.images') as unknown[])
				: [];
			const columns = ['id', 'tags', 'size', 'kept'];
			const paths = ['image.id', 'image.tags', 'image.size', 'kept.kept'];
			return table(columns, rowsOf(paths, images));
		}
		case 'now': {
			if (typeof data !== 'object' || data === null) return str(data);
			const rows = Object.entries(data as Record<string, unknown>).map(([key, value]) => [
				key,
				str(value),
			]);
			return table(['metric', 'value'], rows);
		}
	}
}

function parse(argv: string[]): { what: What; app?: string; path?: string; json: boolean } {
	const json = argv.includes('--json');
	const positional = argv.filter((arg) => arg !== '--json');
	const [what, app, path] = positional;
	if (!what) fail(USAGE);
	if (!(WHATS as readonly string[]).includes(what)) fail(`unknown "${what}"\n${USAGE}`);
	const needs = NEEDS[what as What];
	if (needs.app && !app) fail(`"${what}" needs an app\n${USAGE}`);
	return { what: what as What, app, path, json };
}

function main(): void {
	const token = process.env.HOST_TOKEN ?? fail('HOST_TOKEN is not set; it comes from secrets.json');
	const { what, app, path, json } = parse(process.argv.slice(2));
	const envelope = fetchEnvelope(route(what, app, path), token);
	if (envelope.status === 'error') {
		console.error(`${envelope.code}: ${envelope.message}`);
		process.exit(1);
	}
	console.log(render(what, envelope.data, json));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) main();

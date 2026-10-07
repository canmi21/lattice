/**
 * The views the console is read in: All, with no segment of its own, and the three scopes that
 * narrow it, each its address's first segment; and which scope an app belongs to. See
 * spec/architecture/console.md.
 */

export const SCOPES = [
	{ key: 'infra', label: 'Infra' },
	{ key: 'platform', label: 'Platform' },
	{ key: 'services', label: 'Services' },
] as const;

export type Scope = (typeof SCOPES)[number]['key'];

/** Every scope at once, or one of them. */
export type View = 'all' | Scope;

export const VIEWS = [{ key: 'all', label: 'All' }, ...SCOPES] as const;

export const isScope = (param: string): param is Scope => SCOPES.some(({ key }) => key === param);

/** The view an address's optional first segment names: All where it names none. */
export const viewOf = (param: string | undefined): View =>
	param !== undefined && isScope(param) ? param : 'all';

export const labelOf = (view: View): string => VIEWS.find(({ key }) => key === view)?.label ?? view;

/** infra's apps, mirroring infra's apps/<group>/<app>/ by hand: CI holds this repository alone. */
const INFRA = new Set(['caddy', 'host', 'keeper', 'meter', 'panel', 'resolver', 'tunnel']);

/** The platform's, as its apps/<group>/<app>/service.toml name them, mirrored by hand the same. */
const PLATFORM = new Set([
	'aka',
	'apt',
	'cdn',
	'cron',
	'deployer',
	'gateway',
	'gemini',
	'geo',
	'grok',
	'hook',
	'ledger',
	'objects',
	'postgres',
	'probe',
	'quota',
	'relay',
	'shot',
	'telemetry',
]);

/** Exported for ./scope.test.ts to hold against the platform's manifests. */
export const PLATFORM_APPS: readonly string[] = [...PLATFORM];

/**
 * The layer whose repository built `app`. host records no repository on an app or an event, so
 * the name tells it, and a name neither list holds is a service.
 */
export function scopeOf(app: string): Scope {
	return INFRA.has(app) ? 'infra' : PLATFORM.has(app) ? 'platform' : 'services';
}

/** Whether `view` shows `app`: All shows every one. */
export const shows = (view: View, app: string): boolean => view === 'all' || scopeOf(app) === view;

/** `path` read in `view`: `/nodes/tyo` in Infra is `/infra/nodes/tyo`, in All itself. */
export function within(view: View, path = '/'): string {
	if (view === 'all') return path;
	return path === '/' ? `/${view}` : `/${view}${path}`;
}

/** A node's page: in All from All, and in Infra, where the nodes are, from any scope. */
export const nodeHref = (view: View, code: string): string =>
	within(view === 'all' ? 'all' : 'infra', `/nodes/${code}`);

/** An app's page, in All from All and in the app's own scope from any scope. */
export const appHref = (view: View, app: string): string =>
	within(view === 'all' ? 'all' : scopeOf(app), `/apps/${encodeURIComponent(app)}`);

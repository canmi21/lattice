import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DISPLAY_NAMES,
	PLATFORM_APPS,
	appHref,
	appLabel,
	displayOf,
	isScope,
	nodeHref,
	scopeOf,
	viewOf,
	within,
} from './scope.ts';

const REPOS = join(import.meta.dirname, '../../../../../..');

/**
 * The platform's `apps/`, in its checkout beside this one, and infra's. Absent where only this
 * repository is cloned, and the checks are skipped there rather than failed; see the workspace's
 * spec/architecture/repos.md.
 */
const APPS = join(REPOS, 'platform/apps');
const BESIDE = [join(REPOS, 'infra/apps'), APPS];

const folders = (path: string): string[] =>
	readdirSync(path, { withFileTypes: true })
		.filter((one) => one.isDirectory())
		.map((one) => join(path, one.name));

/** Every `service.toml` under `apps`, read: `apps/<group>/<app>/`, or `apps/<app>/` here. */
function declarations(apps: string, grouped = true): string[] {
	return (grouped ? folders(apps).flatMap(folders) : folders(apps))
		.map((app) => join(app, 'service.toml'))
		.filter((path) => existsSync(path))
		.map((path) => readFileSync(path, 'utf8'));
}

const field = (key: string, toml: string): string | undefined =>
	new RegExp(`^${key} = "([^"]+)"`, 'm').exec(toml)?.[1];

/** Every `name` the platform's declarations hold, sorted. */
const manifests = (): string[] =>
	declarations(APPS)
		.flatMap((toml) => field('name', toml) ?? [])
		.toSorted();

/** Each declaration's `display_name` by its `name`, this repository's own among them. */
const displayNames = (): Record<string, string | undefined> =>
	Object.fromEntries(
		[
			...declarations(join(REPOS, 'web/apps'), false),
			...BESIDE.flatMap((apps) => declarations(apps)),
		].map((toml) => [field('name', toml), field('display_name', toml)]),
	);

describe('scopeOf', () => {
	it.skipIf(!existsSync(APPS))("lists every app the platform's manifests name", () => {
		expect([...PLATFORM_APPS].toSorted()).toEqual(manifests());
	});

	it("puts infra's apps in Infra, the platform's in Platform, and anything else in Services", () => {
		expect(['host', 'relay', 'console'].map(scopeOf)).toEqual(['infra', 'platform', 'services']);
	});
});

describe('displayOf', () => {
	it.skipIf(!BESIDE.every(existsSync))('holds every display name the declarations do', () => {
		const declared = displayNames();
		expect(
			Object.keys(declared)
				.filter((app) => declared[app] !== undefined)
				.toSorted(),
		).toEqual(Object.keys(DISPLAY_NAMES).toSorted());
		for (const [app, name] of Object.entries(declared)) expect(displayOf(app)).toBe(name ?? app);
	});

	it('writes a name it lacks as the code name, and the code name beside one it has', () => {
		expect([displayOf('relay'), displayOf('my-app')]).toEqual(['Relay', 'my-app']);
		expect([appLabel('relay'), appLabel('my-app')]).toEqual(['Relay (relay)', 'my-app']);
	});
});

describe('within', () => {
	it('puts a scope first, and All nowhere', () => {
		expect(within('infra', '/nodes/tyo')).toBe('/infra/nodes/tyo');
		expect([within('all'), within('all', '/apps/web')]).toEqual(['/', '/apps/web']);
		expect(within('services')).toBe('/services');
		expect(within('services', '/events?app=web')).toBe('/services/events?app=web');
	});

	it("stays in All from All, and leads to Infra's nodes and an app's own scope from a scope", () => {
		expect([nodeHref('all', 'tyo'), appHref('all', 'relay')]).toEqual([
			'/nodes/tyo',
			'/apps/relay',
		]);
		expect(nodeHref('services', 'tyo')).toBe('/infra/nodes/tyo');
		expect(['host', 'relay', 'my site'].map((app) => appHref('services', app))).toEqual([
			'/infra/apps/host',
			'/platform/apps/relay',
			'/services/apps/my%20site',
		]);
	});

	it('reads All where the address names no scope', () => {
		expect([viewOf(undefined), viewOf('infra'), viewOf('nodes')]).toEqual(['all', 'infra', 'all']);
	});

	it('knows the three scopes and nothing else', () => {
		expect(['infra', 'platform', 'services', 'nodes', ''].map(isScope)).toEqual([
			true,
			true,
			true,
			false,
			false,
		]);
	});
});

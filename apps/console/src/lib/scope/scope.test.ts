import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_APPS, appHref, isScope, nodeHref, scopeOf, viewOf, within } from './scope.ts';

/**
 * The platform's `apps/`, in its checkout beside this one. Absent where only this repository is
 * cloned, and the check is skipped there rather than failed; see the workspace's
 * spec/architecture/repos.md.
 */
const APPS = join(import.meta.dirname, '../../../../../../platform/apps');

/** Every `name` an `apps/<group>/<app>/service.toml` declares, sorted. */
function manifests(): string[] {
	return readdirSync(APPS, { withFileTypes: true })
		.filter((group) => group.isDirectory())
		.flatMap((group) =>
			readdirSync(join(APPS, group.name)).map((app) => join(APPS, group.name, app, 'service.toml')),
		)
		.filter((path) => existsSync(path))
		.flatMap((path) => /^name = "([^"]+)"/m.exec(readFileSync(path, 'utf8'))?.[1] ?? [])
		.sort();
}

describe('scopeOf', () => {
	it.skipIf(!existsSync(APPS))("lists every app the platform's manifests name", () => {
		expect([...PLATFORM_APPS].sort()).toEqual(manifests());
	});

	it("puts infra's apps in Infra, the platform's in Platform, and anything else in Services", () => {
		expect(['host', 'relay', 'console'].map(scopeOf)).toEqual(['infra', 'platform', 'services']);
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

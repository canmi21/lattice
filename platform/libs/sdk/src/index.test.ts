import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_PORTS, developmentUrls, pickUrls, URLS } from './index';

describe('pickUrls', () => {
	it('returns development app URLs when isDev=true', () => {
		expect(pickUrls(true)).toEqual(URLS.apps.development);
	});

	it('returns production app URLs when isDev=false', () => {
		expect(pickUrls(false)).toEqual(URLS.apps.production);
	});
});

describe('URLS', () => {
	it('keeps apps, internal domains, and external endpoints separate', () => {
		expect(URLS.apps.production).toHaveProperty('site');
		expect(URLS.apps.production).toHaveProperty('api');
		expect(URLS.apps.production).toHaveProperty('cdn');
		expect(URLS.internal).toHaveProperty('app');
		expect(URLS.internal).toHaveProperty('infra');
		expect(URLS.internal).toHaveProperty('alias');
		expect(URLS.external.github).toHaveProperty('cdn');
		expect(URLS.external.google).toHaveProperty('sourcePreferences');
		expect(URLS.external.social).toHaveProperty('telegram');
	});

	it('does not keep discarded app slots', () => {
		expect('res' in URLS.apps.production).toBe(false);
		expect('home' in URLS.apps.production).toBe(false);
		expect('web' in URLS.apps.production).toBe(false);
	});

	it('does not keep retired domains', () => {
		// canmi.dev is not being renewed, and `prod` was renamed to `infra` because it read
		// as a sibling of apps.production while meaning something unrelated.
		expect('dev' in URLS.internal).toBe(false);
		expect('prod' in URLS.internal).toBe(false);
	});
});

describe('development ports', () => {
	it('gives every app its pinned address', () => {
		expect(developmentUrls()).toEqual({
			site: 'http://localhost:26511',
			api: 'http://localhost:26512/v1/site',
			alias: 'http://localhost:26512/v1/aka',
			symlink: 'http://localhost:26512/v1/aka/symlink',
			cdn: 'http://localhost:26512/v3/cdn',
			panel: 'http://localhost:26519',
		});
	});

	// wrangler takes port + 1 for its inspector, so every worker's inspector must land on
	// nothing else, and the CMS port must be clear of all of them: it is a machine-wide
	// singleton, and a collision there is the mutex that stops a second copy writing data/.
	it('keeps the ports clear of the inspector ports and of the CMS port', () => {
		const cms = Number(process.env.LOCAL_PORT ?? 26521);
		// The editor's dev server, pinned in services/apps/cms/vite.config.ts rather than here.
		const editor = 26518;
		const taken = [
			...Object.values(DEVELOPMENT_PORTS),
			DEVELOPMENT_PORTS.api + 1,
			DEVELOPMENT_PORTS.alias + 1,
			DEVELOPMENT_PORTS.cdn + 1,
			DEVELOPMENT_PORTS.quota + 1,
		];
		expect(new Set(taken).size).toBe(taken.length);
		expect(taken).not.toContain(cms);
		expect(taken).not.toContain(editor);
	});

	it('is what the URL map serves, which is what the Rust mirror renders', () => {
		expect(URLS.apps.development).toEqual(developmentUrls());
	});
});

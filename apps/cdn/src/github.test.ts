import { GITHUB_OWNER, URLS } from '@canmi/urls';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from './index';
import { isGitHubHost, isReleaseName, releaseUpstream } from './github';

// A literal rather than an interpolation, for the reference check. Never resolved: the one test
// below that reaches upstream answers its own fetch.
const HOST = 'https://cdn.example';

describe('releaseUpstream', () => {
	it('fetches from the one account, and nowhere in the URL says which', () => {
		const upstream = releaseUpstream('rdm', 'nightly', 'rdm-nightly-macos-arm64.dmg');
		expect(upstream.origin).toBe(URLS.external.github.web);
		expect(upstream.pathname).toBe(
			`/${GITHUB_OWNER}/rdm/releases/download/nightly/rdm-nightly-macos-arm64.dmg`,
		);
	});

	it('spells latest the way GitHub does', () => {
		expect(releaseUpstream('age', 'latest', 'age').pathname).toBe(
			`/${GITHUB_OWNER}/age/releases/latest/download/age`,
		);
	});
});

describe('isReleaseName', () => {
	it('accepts what GitHub accepts', () => {
		expect(isReleaseName('rdm')).toBe(true);
		expect(isReleaseName('v2026.03.16')).toBe(true);
		expect(isReleaseName('C2DB-2026-03-16.zip')).toBe(true);
	});

	it('rejects anything that could reach past the account', () => {
		expect(isReleaseName('..')).toBe(false);
		expect(isReleaseName('a..b')).toBe(false);
		expect(isReleaseName('a/b')).toBe(false);
		expect(isReleaseName('')).toBe(false);
		expect(isReleaseName('.hidden')).toBe(false);
	});
});

describe('isGitHubHost', () => {
	it('follows the redirect only onto GitHub', () => {
		expect(isGitHubHost('github.com')).toBe(true);
		expect(isGitHubHost('release-assets.githubusercontent.com')).toBe(true);
		expect(isGitHubHost('objects.githubusercontent.com')).toBe(true);
		expect(isGitHubHost('evil.example')).toBe(false);
		expect(isGitHubHost('githubusercontent.com.evil.example')).toBe(false);
	});
});

/**
 * The lifetimes this route used to keep, and no longer does.
 *
 * Three numbers about somebody else's release cadence are gone: a proxied file is a name like
 * any other here, so it takes the hour every name takes and five minutes when it fails. An
 * avatar is up to an hour stale rather than five minutes, which is the cost of one rule.
 */
describe('the group as the worker mounts it', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function ask(path: string): Promise<Response> {
		return app.fetch(new Request(HOST + path), {} as never);
	}

	it('keeps a proxied answer for an hour, having no hash to promise more with', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(
			async () => new Response('bytes', { headers: { 'Content-Type': 'image/png' } }),
		);
		const res = await ask('/proxy/github/avatar/canmi21');
		expect(res.status).toBe(200);
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
	});

	it('holds a refusal for five minutes, the way every other group does', async () => {
		// Refused on the name, so nothing upstream is asked -- a fetch here would be the bug.
		const fetching = vi.spyOn(globalThis, 'fetch');
		const res = await ask('/proxy/github/release/a..b/v1/thing.zip');
		expect(res.status).toBe(404);
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
		expect(fetching).not.toHaveBeenCalled();
	});
});

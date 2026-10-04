import { describe, expect, it } from 'vitest';
import { GATEWAY } from '@canmi/urls';
import { profileOf, readRequest } from './profile.ts';

/** A deployment's hostname, from its parts. */
const deployed = (name: string) => `${name}.${GATEWAY.deployments}`;
const read = (host: string, path: string) => readRequest(new URL(path, `https://${host}`));

describe('a hostname read as a profile', () => {
	it('reads a deployment from the right: provider, region, then the service, hyphens and all', () => {
		expect(profileOf(deployed('geo-rdu-int'))).toEqual({
			name: 'deployment',
			service: 'geo',
			placement: { region: 'rdu', provider: 'int' },
			crawled: false,
		});
		expect(profileOf(deployed('two-part-glo-cf'))?.service).toBe('two-part');
		expect(profileOf(deployed('api-glo-cf'))).toEqual({
			name: 'deployment-api',
			placement: { region: 'glo', provider: 'cf' },
			crawled: false,
		});
	});

	it('admits crawlers on the CDN host alone', () => {
		expect(profileOf(GATEWAY.cdn)?.crawled).toBe(true);
		for (const host of [GATEWAY.api, GATEWAY.alias, GATEWAY.symlink, deployed('cdn-glo-cf')]) {
			expect(profileOf(host)?.crawled, host).toBe(false);
		}
	});

	it('answers every domain of the service layer alike', () => {
		for (const domain of GATEWAY.domains) {
			expect(profileOf(`api.${domain}`)).toEqual(profileOf(GATEWAY.api));
			expect(profileOf(`cdn.${domain}`)).toEqual(profileOf(GATEWAY.cdn));
		}
		expect(GATEWAY.api).toBe(`api.${GATEWAY.domains[0]}`);
	});

	it('knows a hostname whatever its case', () => {
		expect(profileOf(GATEWAY.api.toUpperCase())?.name).toBe('api');
	});

	it.each([
		['a region nobody registered', deployed('geo-xyz-int')],
		['a provider nobody registered', deployed('geo-rdu-aws')],
		['a deployment with no service', deployed('rdu-int')],
		['a host of another domain', `${GATEWAY.api}.example`],
	])('names no profile for %s', (_, host) => {
		expect(profileOf(host)).toBeUndefined();
	});
});

describe('a request read into its tuple', () => {
	it('takes the version, then the service, from the path on the API host', () => {
		expect(read(GATEWAY.api, '/v1/geo/ip?address=1.1.1.1')).toEqual({
			profile: 'api',
			service: 'geo',
			version: 'v1',
			path: '/ip',
			forward: '/v1/ip',
		});
	});

	it("puts a short host's pinned version, and its prefix, in front of the path", () => {
		expect(read(GATEWAY.cdn, '/object/abc.avif')).toMatchObject({
			service: 'cdn',
			version: 'v3',
			forward: '/v3/object/abc.avif',
		});
		expect(read(GATEWAY.alias, '/k7m2x')).toMatchObject({ service: 'alias', forward: '/v1/k7m2x' });
		expect(read(GATEWAY.symlink, '/site/favicon.ico')).toMatchObject({
			service: 'alias',
			path: '/symlink/site/favicon.ico',
			forward: '/v1/symlink/site/favicon.ico',
		});
	});

	it('carries the placement a deployment hostname names', () => {
		expect(read(deployed('geo-rdu-int'), '/v1/address')).toEqual({
			profile: 'deployment',
			service: 'geo',
			version: 'v1',
			placement: { region: 'rdu', provider: 'int' },
			path: '/address',
			forward: '/v1/address',
		});
		expect(read(deployed('api-glo-cf'), '/v1/site/stats')).toMatchObject({
			service: 'site',
			placement: { region: 'glo', provider: 'cf' },
			forward: '/v1/stats',
		});
	});

	it("forwards a retired host's old path as it was, unversioned", () => {
		expect(read(GATEWAY.retired.api, '/geo/ip')).toMatchObject({
			service: 'geo',
			version: null,
			forward: '/ip',
		});
		expect(read(GATEWAY.retired.cdn, '/object/abc.avif')).toMatchObject({
			service: 'cdn',
			forward: '/object/abc.avif',
		});
	});

	it.each([
		['no_such_host', 'example.com', '/v1/geo/ip'],
		['no_version', GATEWAY.api, '/geo/ip'],
		['no_version', deployed('geo-rdu-int'), '/ip'],
		['no_version', GATEWAY.api, '/v0/geo'],
		['no_service', GATEWAY.api, '/v1/'],
		['no_service', GATEWAY.api, '/v1/Geo/ip'],
	])('refuses with %s: %s%s', (refusal, host, path) => {
		expect(read(host, path)).toBe(refusal);
	});
});

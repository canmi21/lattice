import { describe, expect, it } from 'vitest';
import { FACTS, PROVIDERS, providerName } from './facts.ts';

describe('failure domains', () => {
	it('are provider codes, each one the copy of the registry names', () => {
		expect(Object.values(FACTS).map((facts) => facts.domain)).toEqual([
			'oci',
			'oci',
			'oci',
			'az',
			'az',
			'rkn',
			'int',
			'int',
		]);
		for (const { domain } of Object.values(FACTS)) expect(PROVIDERS[domain]).toBeDefined();
		expect(Object.keys(PROVIDERS)).toEqual(['oci', 'az', 'rkn', 'int', 'cf', 'vcl']);
	});

	it('are read by the provider name, a second account numbered, an unknown code as written', () => {
		expect(['oci', 'az', 'rkn', 'int', 'cf', 'vcl'].map(providerName)).toEqual([
			'Oracle',
			'Azure',
			'RackNerd',
			'Self-hosted',
			'Cloudflare',
			'Vercel',
		]);
		expect(providerName('oci-2')).toBe('Oracle 2');
		expect(providerName('xyz')).toBe('xyz');
		expect(providerName('xyz-2')).toBe('xyz-2');
		expect(providerName('racknerd')).toBe('racknerd');
	});
});

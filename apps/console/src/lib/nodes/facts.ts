/**
 * What a person declares of each node rather than what it measures: mirrors infra's
 * nodes/nodes.toml, whose axes are infra's spec/architecture/nodes.md.
 */
import type { Node } from '../server/nodes.ts';

export interface Facts {
	tier: 'datacenter' | 'home' | 'transient';
	/**
	 * The account it is held under, as its provider's code -- `oci`, or `oci-2` for a second account
	 * there: nodes in one fail together, save `int`, where each node is a domain of its own --
	 * infra's spec/architecture/nodes.md. A person reads it by `providerName`.
	 */
	domain: string;
	/** Until when it is expected to be held, a year; none for a node at home. */
	expiry?: number;
	system: 'debian' | 'alpine';
}

export const FACTS: Record<Node, Facts> = {
	tyo: { tier: 'datacenter', domain: 'oci', expiry: 2036, system: 'debian' },
	nrt: { tier: 'datacenter', domain: 'oci', expiry: 2036, system: 'alpine' },
	hnd: { tier: 'datacenter', domain: 'oci', expiry: 2036, system: 'alpine' },
	gvx: { tier: 'datacenter', domain: 'az', expiry: 2030, system: 'debian' },
	bru: { tier: 'datacenter', domain: 'az', expiry: 2030, system: 'debian' },
	buf: { tier: 'datacenter', domain: 'rkn', expiry: 2027, system: 'debian' },
	rdu: { tier: 'home', domain: 'int', system: 'debian' },
	sha: { tier: 'home', domain: 'int', system: 'debian' },
};

/** Every node, in the order the table declares them: by failure domain, home last. */
export const CODES = Object.keys(FACTS) as Node[];

/**
 * Each provider's name as a person reads it, by its code: platform's
 * spec/architecture/gateway.md, "Providers are short codes, registered here". A copy until the
 * `@monoflake/sdk` the console resolves names them in `GATEWAY.providers`; ./facts.test.ts holds
 * it against the domains above.
 */
export const PROVIDERS: Readonly<Record<string, string>> = {
	oci: 'Oracle',
	az: 'Azure',
	rkn: 'RackNerd',
	int: 'Self-hosted',
	cf: 'Cloudflare',
	vcl: 'Vercel',
};

/** A failure domain by its provider's name, `oci-2` as `Oracle 2`; a code it lacks as written. */
export function providerName(domain: string): string {
	const [, code = '', account] = /^([a-z]+)(?:-(\d+))?$/.exec(domain) ?? [];
	const name = PROVIDERS[code];
	if (!name) return domain;
	return account ? `${name} ${account}` : name;
}

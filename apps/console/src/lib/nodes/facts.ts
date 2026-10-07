/**
 * What a person declares of each node rather than what it measures: mirrors infra's
 * nodes/nodes.toml, whose axes are infra's spec/architecture/nodes.md.
 */
import type { Node } from '../server/nodes.ts';

export interface Facts {
	tier: 'datacenter' | 'home' | 'transient';
	/** The account it is held under: nodes in one fail together. */
	domain: string;
	/** Until when it is expected to be held, a year; none for a node at home. */
	expiry?: number;
	system: 'debian' | 'alpine';
}

export const FACTS: Record<Node, Facts> = {
	tyo: { tier: 'datacenter', domain: 'oci', expiry: 2036, system: 'debian' },
	nrt: { tier: 'datacenter', domain: 'oci', expiry: 2036, system: 'alpine' },
	hnd: { tier: 'datacenter', domain: 'oci', expiry: 2036, system: 'alpine' },
	gvx: { tier: 'datacenter', domain: 'azure', expiry: 2030, system: 'debian' },
	bru: { tier: 'datacenter', domain: 'azure', expiry: 2030, system: 'debian' },
	buf: { tier: 'datacenter', domain: 'racknerd', expiry: 2027, system: 'debian' },
	rdu: { tier: 'home', domain: 'home', system: 'debian' },
};

/** Every node, in the order the table declares them: by failure domain, home last. */
export const CODES = Object.keys(FACTS) as Node[];

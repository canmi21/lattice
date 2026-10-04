/**
 * Every hostname the gateway answers, read into one tuple -- the service, the version, where it
 * runs, the path -- by the profile the hostname names. A profile is a row: what the hostname fixes,
 * and what the path is left to say. See spec/architecture/gateway.md, "Every request is one
 * address, written several ways".
 */
import { GATEWAY } from '@monoflake/sdk';

export type Provider = keyof typeof GATEWAY.providers;
export type Region = keyof typeof GATEWAY.regions;

/** Where a deployment runs, when the hostname names one; absent, the gateway chooses. */
export interface Placement {
	readonly region: Region;
	readonly provider: Provider;
}

/** What a hostname fixes. A field it leaves out, the path says. */
export interface Profile {
	readonly name: string;
	readonly service?: string;
	/** The version the hostname pins; absent, the path names it. */
	readonly version?: string;
	/** Put in front of the path the hostname was asked, after the version. */
	readonly prefix?: string;
	readonly placement?: Placement;
	/**
	 * Whether the host admits a crawler at all; where it does, each route's `crawlable` says what.
	 * See spec/architecture/gateway.md, "A host admits crawlers or does not".
	 */
	readonly crawled: boolean;
}

/** A request read: what the service is asked, and how. */
export interface Tuple {
	readonly profile: string;
	readonly service: string;
	/** `v1`, `v3`. */
	readonly version: string;
	readonly placement?: Placement;
	/** The path after the version, as the service's declaration names its routes. */
	readonly path: string;
	/** What the service receives: the version, then the path. */
	readonly forward: string;
}

/** Why a request could not be read, each the client's to fix. */
export type Refusal = 'no_such_host' | 'no_version' | 'no_service';

/** The hostnames named exactly. The deployments under `ixc.one` are read by their parts. */
const NAMED: Readonly<Record<string, Profile>> = {
	...Object.fromEntries(
		GATEWAY.domains.flatMap((domain) => [
			[`api.${domain}`, { name: 'api', crawled: false }],
			[`cdn.${domain}`, { name: 'cdn', service: 'cdn', version: 'v3', crawled: true }],
		]),
	),
	// Short links, and the old marks under `/symlink` until nothing asks for them there.
	[GATEWAY.alias]: { name: 'alias', service: 'aka', version: 'v1', crawled: true },
	[GATEWAY.symlink]: {
		name: 'symlink',
		service: 'aka',
		version: 'v1',
		prefix: '/symlink',
		crawled: true,
	},
	// Read as the hosts that replaced them, at the version their old paths are spelled for. See
	// spec/architecture/gateway.md, "A domain leaves without a redirect".
	[GATEWAY.retired.api]: { name: 'retired-api', version: 'v1', crawled: false },
	[GATEWAY.retired.cdn]: { name: 'retired-cdn', service: 'cdn', version: 'v3', crawled: true },
};

const VERSION = /^v[1-9]\d*$/;
const SERVICE = /^[a-z][a-z0-9-]*$/;

function isProvider(code: string): code is Provider {
	return Object.hasOwn(GATEWAY.providers, code);
}

function isRegion(code: string): code is Region {
	return Object.hasOwn(GATEWAY.regions, code);
}

/**
 * The profile `hostname` names, or `undefined` for none. A deployment's hostname is read from the
 * right: the provider, then the region, both registered codes, and the rest is the service -- or
 * `api`, which leaves the service to the path.
 */
export function profileOf(hostname: string): Profile | undefined {
	const host = hostname.toLowerCase();
	const named = NAMED[host];
	if (named) return named;
	const suffix = `.${GATEWAY.deployments}`;
	if (!host.endsWith(suffix)) return undefined;
	const parts = host.slice(0, -suffix.length).split('-');
	const provider = parts.pop() ?? '';
	const region = parts.pop() ?? '';
	const service = parts.join('-');
	if (!isProvider(provider) || !isRegion(region) || !SERVICE.test(service)) return undefined;
	const placement = { region, provider };
	// A deployment's own host refuses every crawler: it is an address to pin, not one to index.
	return service === 'api'
		? { name: 'deployment-api', placement, crawled: false }
		: { name: 'deployment', service, placement, crawled: false };
}

/** The path's leading segment, and the path after it. */
function shift(path: string): [string, string] {
	const [, first = '', ...rest] = path.split('/');
	return [first, `/${rest.join('/')}`];
}

/**
 * `url` read into its tuple by the profile its hostname names, or why it cannot be. The path is
 * taken as it came; its spelling is the gateway's to settle first.
 */
export function readRequest(url: URL): Tuple | Refusal {
	const profile = profileOf(url.hostname);
	if (!profile) return 'no_such_host';
	let rest = url.pathname;
	let version = profile.version;
	if (version === undefined) {
		const [segment, after] = shift(rest);
		if (!VERSION.test(segment)) return 'no_version';
		[version, rest] = [segment, after];
	}
	let service = profile.service;
	if (service === undefined) {
		const [segment, after] = shift(rest);
		if (!SERVICE.test(segment)) return 'no_service';
		[service, rest] = [segment, after];
	}
	const path = `${profile.prefix ?? ''}${rest === '/' && profile.prefix ? '' : rest}`;
	return {
		profile: profile.name,
		service,
		version,
		...(profile.placement ? { placement: profile.placement } : {}),
		path,
		forward: `/${version}${path}`,
	};
}

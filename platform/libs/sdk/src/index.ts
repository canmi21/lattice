/**
 * The platform's addresses, and the whole map as everything above infra reads it: the platform's
 * own declared here, the author's from `canmi` and infra's from `@monoflake/urls`, composed into
 * one shape so a caller asks one place and the Rust mirror has one source. See
 * spec/architecture/layers.md, "Addresses are split by who owns the name".
 */
import {
	CONTACT,
	EXTERNAL,
	GITHUB_OWNER,
	PORT_OFFSET,
	SITE,
	SITE_PORT,
	SOURCE,
	isDevHost,
	LOOPBACK_HOST,
	loopbackUrl,
	normalizedLocation,
	normalizePath,
	type Normalized,
} from 'canmi/urls';
import { INFRA, PANEL_PORT } from '@monoflake/urls';

export {
	GITHUB_OWNER,
	isDevHost,
	LOOPBACK_HOST,
	loopbackUrl,
	normalizedLocation,
	normalizePath,
	PORT_OFFSET,
	type Normalized,
};

/**
 * The ports each app answers on in development.
 *
 * Pinned, and bound by exactly one checkout at a time. The gaps are the inspector ports, which
 * wrangler takes as port + 1, and they keep clear of LOCAL_PORT (mise.toml). A second copy of an
 * app collides here rather than drifting to a free port, which is the cheapest mutex there is.
 * See spec/toolchain.md.
 */
export const PINNED_PORTS = {
	site: SITE_PORT,
	api: 26512,
	alias: 26514,
	cdn: 26516,
	panel: PANEL_PORT,
} as const;

/** Workers reached by binding alone: a port that is the mutex, and no address. */
export const BOUND_PORTS = {
	quota: 26523,
} as const;

/** The ports this checkout's servers bind: the pinned ones, shifted in the sandbox. */
export const DEVELOPMENT_PORTS = Object.fromEntries(
	Object.entries({ ...PINNED_PORTS, ...BOUND_PORTS }).map(([app, port]) => [
		app,
		port + PORT_OFFSET,
	]),
) as { readonly [App in keyof typeof PINNED_PORTS | keyof typeof BOUND_PORTS]: number };

export type AppName = keyof typeof PINNED_PORTS;

export type DevelopmentUrls = Readonly<Record<AppName | 'symlink', string>>;

/** The site's scope of the API host, which is the service's name, `site`. */
const SITE_SCOPE = 'site';

/**
 * Where the alias layer and the CDN are reached *from a page* in development: through the site.
 *
 * A page carries no host of its own for either prefix -- see spec/toolchain.md, "They bind
 * every interface, and the other two are reached through the site", for why that is what
 * makes the site work from a phone on the same network. The site's API needs no proxy: the
 * site's Worker answers it under `/api/` itself.
 */
export const DEVELOPMENT_PROXY_PATHS = {
	alias: '/alias',
	symlink: '/symlink',
	cdn: '/cdn',
} as const;

export function developmentUrl(app: AppName): string {
	return `http://localhost:${DEVELOPMENT_PORTS[app]}`;
}

/**
 * Every app's address in development. The service layer is reached through the development gateway,
 * as it is in production, so its CORS and its lifetimes hold here too; the gateway has no short
 * hosts here, so each is a service of the API host, at the version its short host pins. See
 * spec/architecture/gateway.md and spec/architecture/services.md, "Development goes through the
 * gateway too".
 */
export function developmentUrls(): DevelopmentUrls {
	const gateway = developmentUrl('api');
	return {
		site: developmentUrl('site'),
		api: `${gateway}/v1/${SITE_SCOPE}`,
		alias: `${gateway}/v1/aka`,
		symlink: `${gateway}/v1/aka/symlink`,
		cdn: `${gateway}/v3/cdn`,
		panel: developmentUrl('panel'),
	};
}

const development: DevelopmentUrls = developmentUrls();

/** The API host's two sides: private, where every container asks, and public, past the gateway. */
const API = {
	private: 'https://api.internal.ixc.one',
	public: 'https://api.monoflake.com',
} as const;

/**
 * The domains owned here, which the production map below reads rather than spelling twice.
 * `infra` is the retired apex api and cdn hung off; `alias` the alias layer's. `app` is the suffix
 * every interface is on behind Access, see spec/architecture/services.md; `panel`, `keeper` and
 * `host` are infra's, see spec/architecture/host.md; `ledger` is where every service records its
 * tasks, see ledger.md; `shot` is the public scope a capture's pictures are named under, see
 * shot.md.
 */
const INTERNAL = {
	app: 'https://canmi.app',
	infra: 'https://ffoni.com',
	alias: 'https://ill.li',
	...INFRA,
	ledger: `${API.private}/ledger`,
	cron: `${API.private}/cron`,
	shot: `${API.public}/v1/shot`,
	api: API,
	// The status page's doors: the one address, and Vercel's own name for it, reached while
	// Cloudflare's DNS is not. See spec/architecture/probe.md, "The page: one app, three doors".
	status: { canonical: 'https://status.canmi.app', mirror: 'https://canmi.vercel.app' },
} as const;

export const URLS = {
	apps: {
		development,
		production: {
			site: SITE,
			// The site's public scope of the API host, which the alias layer reads; see
			// spec/architecture/services.md, "The site's API runs in the site's Worker".
			api: `${API.public}/v1/${SITE_SCOPE}`,
			// An apex of its own rather than a label under `infra`, because here the address is
			// the product: a resolved name is read aloud and typed, and `ill.li/k7m2x` is short
			// enough to be either. See spec/architecture/delivery.md.
			alias: INTERNAL.alias,
			// Where a scope's fixed names are followed: the alias layer's own host for them. See
			// spec/architecture/gateway.md, "Every request is one address".
			symlink: 'https://symlink.si',
			cdn: 'https://cdn.monoflake.com',
			// The panel, host's interface, an app of its own; see spec/architecture/host.md.
			panel: INTERNAL.panel,
		},
	},
	source: SOURCE,
	// The apexes, declared once above so the one a worker answers on cannot be spelled twice.
	internal: INTERNAL,
	contact: CONTACT,
	external: {
		...EXTERNAL,
		// DNS over HTTPS, asked by address so that asking needs no DNS of its own; both answer for
		// every name `shot` captures, and the addresses both give must be public. The certificates
		// for both name the addresses. See spec/architecture/shot.md, "Only public addresses".
		doh: {
			cloudflare: 'https://1.1.1.1/dns-query',
			google: 'https://8.8.8.8/resolve',
		},
		// GeoLite2, as a mirror republishes it daily without a license key, and whose it is, which
		// `geo` credits in every answer. See spec/architecture/geo.md.
		geolite: {
			city: 'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb',
			asn: 'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-ASN.mmdb',
			maxmind: 'https://www.maxmind.com',
		},
	},
} as const;

/**
 * The service layer's hostnames, every one bound to the gateway, and the codes a deployment's own
 * hostname is spelled from: `{service}-{region}-{provider}` under `deployments`. A provider or a
 * region is added here before anything is placed on it. See spec/architecture/gateway.md.
 */
export const GATEWAY = {
	// Each answers the same, the first the one published and the rest a way round a domain that
	// fails. See spec/architecture/gateway.md, "A second domain answers the same".
	domains: ['monoflake.com', 'monoflake.net'],
	api: 'api.monoflake.com',
	cdn: 'cdn.monoflake.com',
	deployments: 'ixc.one',
	alias: 'ill.li',
	symlink: 'symlink.si',
	// Proxied, never redirected, until nothing here calls them. See spec/architecture/gateway.md,
	// "A domain leaves without a redirect".
	retired: { api: 'api.ffoni.com', cdn: 'cdn.ffoni.com' },
	providers: { int: 'our own machines', cf: 'Cloudflare', vcl: 'Vercel' },
	regions: { rdu: 'the machine at home, by Raleigh-Durham', glo: 'everywhere, as a Worker runs' },
} as const;

/**
 * Every hostname the gateway answers at home, as a certificate and a router name them: a wildcard
 * over each zone it owns below the apex, and the two apexes it is. The retired hosts are left out:
 * the house never asks them. See spec/architecture/host.md, "The inside side answers the internal
 * gateway alone".
 */
export const GATEWAY_HOSTS: readonly string[] = [
	...GATEWAY.domains.map((domain) => `*.${domain}`),
	`*.${GATEWAY.deployments}`,
	GATEWAY.alias,
	GATEWAY.symlink,
];

/**
 * The names the gateway answers at home, exactly, as the house's resolver answers them: the API and
 * CDN hosts of each domain and the two apexes, and a deployment's own name, read as the profiles
 * read it, from the registered regions and providers. Nothing else in those zones is the gateway's,
 * so nothing else is answered with the node. See spec/architecture/host.md, "The resolver answers
 * the gateway's names, and passes the rest on".
 */
export const GATEWAY_NAMES = {
	exact: [
		...GATEWAY.domains.flatMap((domain) => [`api.${domain}`, `cdn.${domain}`]),
		GATEWAY.alias,
		GATEWAY.symlink,
	],
	deployments: {
		zone: GATEWAY.deployments,
		regions: Object.keys(GATEWAY.regions),
		providers: Object.keys(GATEWAY.providers),
	},
} as const;

/**
 * Where each consumer's pages are served, by its service code: what a declaration's `cors.origins`
 * names, so no `service.toml` spells an origin. The status page has three doors, the platform's
 * own among them. See spec/architecture/gateway.md, "A route names who may call it by service
 * code".
 */
export const PAGE_ORIGINS: Readonly<Record<string, readonly string[]>> = {
	site: [URLS.apps.production.site],
	status: [INTERNAL.status.canonical, INTERNAL.status.mirror, INTERNAL.app],
};

export type UrlEnvironment = keyof typeof URLS.apps;
export type UrlMap = (typeof URLS.apps)[UrlEnvironment];

export function pickUrls(isDev: boolean): UrlMap {
	return isDev ? URLS.apps.development : URLS.apps.production;
}

/**
 * The same map as `pickUrls`, as a page served by the site should ask for it.
 *
 * Two functions because two consumers want opposite things from the development entry: a
 * worker wants origins it can put in a CORS list or a redirect, while a page wants paths, since
 * the host it should ask is whichever one it was opened from and need not be `localhost`.
 * Identical to `pickUrls` in production, where nothing is proxied.
 */
export function pageUrls(isDev: boolean): UrlMap {
	return isDev ? { ...URLS.apps.development, ...DEVELOPMENT_PROXY_PATHS } : URLS.apps.production;
}

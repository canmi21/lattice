/**
 * The hosts a page reaches early, each with its policy, and the one way an app declares them.
 *
 * An app names the entries its pages reach and gets back the `<link>` tags to write, in the
 * catalog's order; the addresses are `@monoflake/sdk`', the policies are written here once. See
 * spec/architecture/hints.md.
 */
import { pageUrls, URLS } from '@monoflake/sdk';

/** `connect` is a preconnect, lookup through TLS; `resolve` is a dns-prefetch, the lookup alone. */
export type Level = 'connect' | 'resolve';

export interface ScriptPolicy {
	readonly defer: boolean;
	readonly fetchpriority: 'auto' | 'high' | 'low';
}

interface Entry {
	/** Fixed, by mode where the page reaches it differently in development, or the app's to name. */
	readonly href: string | ((dev: boolean) => string) | typeof SUPPLIED;
	readonly level: Level;
	readonly crossorigin?: 'anonymous';
	readonly load?: ScriptPolicy;
}

/** An address the app names at declaration time, because only it can read it at run time. */
const SUPPLIED = null;

/**
 * Fetched with everything else, deferred and at low priority: behind what the reader waits for,
 * never waiting for anything to finish. See spec/architecture/hints.md.
 */
const ANALYTICS_LOAD: ScriptPolicy = { defer: true, fetchpriority: 'low' };

const CATALOG = {
	fonts: {
		stylesheets: { href: URLS.external.googleFonts.css, level: 'connect' },
		// A font file is fetched in CORS mode, so only an anonymous connection is reused for it.
		files: { href: URLS.external.googleFonts.static, level: 'connect', crossorigin: 'anonymous' },
	},
	// Asked by a CORS fetch, as the data entry below is, so only an anonymous connection is reused.
	api: {
		public: { href: URLS.internal.api.public, level: 'connect', crossorigin: 'anonymous' },
	},
	// Proxied through the page's own host in development, hence by mode.
	ours: {
		cdn: { href: (dev) => pageUrls(dev).cdn, level: 'connect', crossorigin: 'anonymous' },
		alias: { href: (dev) => pageUrls(dev).alias, level: 'connect', crossorigin: 'anonymous' },
	},
	jsdelivr: {
		files: { href: URLS.external.github.cdn, level: 'resolve', crossorigin: 'anonymous' },
	},
	// The Supabase project, named by the app from its environment and asked by a CORS fetch.
	data: {
		status: { href: SUPPLIED, level: 'connect', crossorigin: 'anonymous' },
	},
	/**
	 * Resolved, not connected: the loader is asked at low priority and the two reporting hosts only
	 * once the reader has the page, so a handshake before the first paint would compete with it for
	 * nothing. `umami` is where the loader comes from; the other two are where each cloud's client
	 * reports. See spec/analytics.md, "The analytics hosts are resolved early, not connected early".
	 */
	analytics: {
		umami: { href: URLS.external.umami, level: 'resolve', load: ANALYTICS_LOAD },
		umamiCloud: { href: URLS.external.umamiGateway, level: 'resolve' },
		openpanel: { href: URLS.external.openpanel, level: 'resolve' },
	},
} as const satisfies Record<string, Record<string, Entry>>;

type Catalog = typeof CATALOG;
export type Group = keyof Catalog;

type Supplied<G extends Group> = {
	[E in keyof Catalog[G]]: Catalog[G][E] extends { href: typeof SUPPLIED } ? E : never;
}[keyof Catalog[G]];
type Known<G extends Group> = Exclude<keyof Catalog[G], Supplied<G>>;

/** An entry the app names the address of, at its own level or one it moves it to. */
export type SuppliedEntry = string | { readonly href: string; readonly level?: Level };

/** Entries at their own level as a list, or a level for each; a supplied one takes its address. */
export type GroupDeclaration<G extends Group> =
	| readonly Known<G>[]
	| { readonly [E in keyof Catalog[G]]?: E extends Supplied<G> ? SuppliedEntry : Level };

export type Declaration = { readonly [G in Group]?: GroupDeclaration<G> };

export interface HintLink {
	readonly rel: 'preconnect' | 'dns-prefetch';
	readonly href: string;
	readonly crossorigin?: 'anonymous';
}

export interface HintOptions {
	/** The mode `pageUrls` is asked in, for the entries a page reaches differently in development. */
	readonly dev: boolean;
}

const REL: Record<Level, HintLink['rel']> = { connect: 'preconnect', resolve: 'dns-prefetch' };

/** The declared entries as link tags, in the catalog's order whatever the declaration's. */
export function hints(declaration: Declaration, { dev }: HintOptions): HintLink[] {
	const links: HintLink[] = [];
	for (const [group, entries] of Object.entries(CATALOG) as [Group, Record<string, Entry>][]) {
		const declared = declaration[group];
		if (!declared) continue;
		for (const [name, entry] of Object.entries(entries)) {
			const chosen = choose(declared, name, entry, dev);
			if (!chosen) continue;
			const rel = REL[chosen.level];
			const href = origin(chosen.href);
			// Only a connection has a credentials mode to match; a lookup is the same either way.
			links.push(
				rel === 'preconnect' && entry.crossorigin
					? { rel, href, crossorigin: entry.crossorigin }
					: { rel, href },
			);
		}
	}
	return links;
}

/** How a script loaded from an entry is fetched, for the entries a page loads one from. */
export function scriptPolicy<G extends LoadingGroup>(group: G, entry: Loading<G>): ScriptPolicy {
	const policy = (CATALOG[group] as Record<string, Entry>)[entry as string]?.load;
	if (!policy) throw new Error(`${group}.${String(entry)} loads no script`);
	return policy;
}

type Loading<G extends Group> = {
	[E in keyof Catalog[G]]: Catalog[G][E] extends { load: ScriptPolicy } ? E : never;
}[keyof Catalog[G]];
type LoadingGroup = { [G in Group]: [Loading<G>] extends [never] ? never : G }[Group];

function choose(
	declared: GroupDeclaration<Group>,
	name: string,
	entry: Entry,
	dev: boolean,
): { href: string; level: Level } | undefined {
	if (Array.isArray(declared)) {
		return (declared as readonly string[]).includes(name)
			? { href: address(entry, dev), level: entry.level }
			: undefined;
	}
	const value = (declared as Readonly<Record<string, Level | SuppliedEntry | undefined>>)[name];
	if (value === undefined) return undefined;
	if (entry.href !== SUPPLIED) return { href: address(entry, dev), level: value as Level };
	const supplied = value as SuppliedEntry;
	return typeof supplied === 'string'
		? { href: supplied, level: entry.level }
		: { href: supplied.href, level: supplied.level ?? entry.level };
}

function address(entry: Entry, dev: boolean): string {
	const { href } = entry;
	if (href === SUPPLIED) throw new Error('a supplied entry is named with its address');
	return typeof href === 'function' ? href(dev) : href;
}

/** A hint is for a host, so an address is cut to its origin; a development proxy path stays. */
function origin(href: string): string {
	// Not `URL.canParse`: Chrome 120 is above the API floor. See spec/compat.md.
	try {
		return new URL(href).origin;
	} catch {
		return href;
	}
}

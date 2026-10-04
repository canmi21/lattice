/**
 * A service's `[api]` declaration, held to its schema and resolved into the routes the gateway
 * matches: every field looked up on the route, then the service's defaults, then the gateway's own.
 * Run when the table is generated, never in the Worker. See spec/architecture/gateway.md, "The
 * declaration".
 */
import { PAGE_ORIGINS } from '@canmi/urls';
import * as v from 'valibot';

/** Seconds an answer is kept, or `immutable` for a year the bytes will not change in. */
export type Lifetime = number | 'immutable';

/** The four kinds of answer a lifetime is declared for, named for their class. */
export interface Lifetimes {
	readonly fulfilled: Lifetime;
	readonly redirected: Lifetime;
	readonly rejected: Lifetime;
	readonly faulted: Lifetime;
}

/** Which browsers may call a route, and with what. */
export interface Cors {
	/** `public` for any origin, or the service codes whose pages may call. */
	readonly origins: 'public' | readonly string[];
	readonly methods: readonly string[];
	/** Request headers allowed beside `Content-Type`. */
	readonly headers: readonly string[];
}

/** One route, every field resolved. `cors` absent is no browser at all. */
export interface Route {
	/** As declared: exact, or a prefix ending in `/*`, after the version. */
	readonly path: string;
	readonly cors?: Cors;
	readonly cache: Lifetimes;
	readonly crawlable: boolean;
	/** Whether the path is an address the public may reach at all. */
	readonly exposed: boolean;
	/** Query parameters, or JSON keys, the public may not send. */
	readonly forbidden: readonly string[];
	readonly auth: 'none';
}

/** What a route gets when neither it nor its service says. */
export const GATEWAY_DEFAULTS = {
	cache: { fulfilled: 900, redirected: 900, rejected: 300, faulted: 300 },
	crawlable: false,
	exposed: true,
	forbidden: [],
	auth: 'none',
} as const satisfies Omit<Route, 'path' | 'cors'>;

const YEAR = 31_536_000;
const UNITS = { s: 1, m: 60, h: 3_600, d: 86_400 } as const;
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** A lifetime as written -- `30s`, `15m`, `1h`, `1d`, `immutable` or `none` -- in seconds. */
export function lifetimeOf(written: string): Lifetime {
	if (written === 'immutable') return 'immutable';
	if (written === 'none') return 0;
	const match = /^(\d+)([smhd])$/.exec(written);
	if (!match) throw new Error(`a lifetime is 30s, 15m, 1h, 1d, immutable or none, not "${written}"`);
	const seconds = Number(match[1]) * UNITS[match[2] as keyof typeof UNITS];
	if (seconds > YEAR) throw new Error(`a lifetime is at most a year, not "${written}"`);
	return seconds;
}

const Written = v.pipe(
	v.string(),
	v.check((value) => {
		try {
			lifetimeOf(value);
			return true;
		} catch {
			return false;
		}
	}, 'a lifetime is 30s, 15m, 1h, 1d, immutable or none'),
);

const CacheSchema = v.strictObject({
	success: v.optional(
		v.strictObject({ fulfilled: v.optional(Written), redirected: v.optional(Written) }),
	),
	failure: v.optional(v.strictObject({ rejected: v.optional(Written), faulted: v.optional(Written) })),
});

const CorsSchema = v.strictObject({
	origins: v.union([
		v.literal('public'),
		v.pipe(
			v.array(v.picklist(Object.keys(PAGE_ORIGINS))),
			v.minLength(1, 'origins names at least one service'),
		),
	]),
	methods: v.optional(v.pipe(v.array(v.picklist(METHODS)), v.minLength(1))),
	headers: v.optional(v.array(v.pipe(v.string(), v.regex(/^[a-z0-9-]+$/, 'a header is lowercase')))),
});

const FIELDS = {
	cors: v.optional(v.union([v.literal(false), CorsSchema])),
	cache: v.optional(CacheSchema),
	crawlable: v.optional(v.boolean()),
	exposed: v.optional(v.boolean()),
	forbidden: v.optional(v.array(v.string())),
	auth: v.optional(v.literal('none')),
};

/** Exact, or a prefix ending in `/*`; no empty segment, and no `*` anywhere else. */
const PATH = /^(?:\/\*|\/(?:[^/*]+(?:\/[^/*]+)*)?(?:\/\*)?)$/;

const RouteSchema = v.strictObject({
	path: v.pipe(v.string(), v.regex(PATH, 'a path is exact, or a prefix ending in /*')),
	...FIELDS,
});

const LimitSchema = v.strictObject({
	methods: v.array(v.picklist(METHODS)),
	path: v.string(),
	count: v.number(),
	seconds: v.number(),
});

export const ApiSchema = v.strictObject({
	public: v.optional(v.boolean()),
	prefix: v.optional(v.string()),
	limits: v.optional(v.array(LimitSchema)),
	defaults: v.optional(v.strictObject(FIELDS)),
	routes: v.optional(v.array(RouteSchema)),
});

export type Api = v.InferOutput<typeof ApiSchema>;
type Fields = v.InferOutput<v.ObjectSchema<typeof FIELDS, undefined>>;

/** Whether `path` is a prefix, and what it matches without its `*`. */
function stemOf(path: string): { prefix: boolean; stem: string } {
	return path.endsWith('/*') ? { prefix: true, stem: path.slice(0, -1) } : { prefix: false, stem: path };
}

/** Exact before prefix, the longer before the shorter: the order a path is matched in. */
function specificity(a: string, b: string): number {
	const x = stemOf(a);
	const y = stemOf(b);
	if (x.prefix !== y.prefix) return x.prefix ? 1 : -1;
	return y.stem.length - x.stem.length || x.stem.localeCompare(y.stem);
}

function cacheOf(...layers: readonly (Fields['cache'] | undefined)[]): Lifetimes {
	const pick = (read: (cache: NonNullable<Fields['cache']>) => string | undefined): Lifetime | undefined => {
		for (const layer of layers) {
			const written = layer && read(layer);
			if (written !== undefined) return lifetimeOf(written);
		}
		return undefined;
	};
	const fallback = GATEWAY_DEFAULTS.cache;
	return {
		fulfilled: pick((c) => c.success?.fulfilled) ?? fallback.fulfilled,
		redirected: pick((c) => c.success?.redirected) ?? fallback.redirected,
		rejected: pick((c) => c.failure?.rejected) ?? fallback.rejected,
		faulted: pick((c) => c.failure?.faulted) ?? fallback.faulted,
	};
}

function resolve(path: string, route: Fields, defaults: Fields): Route {
	const cors = route.cors ?? defaults.cors;
	return {
		path,
		...(cors
			? {
					cors: {
						origins: cors.origins,
						methods: cors.methods ?? ['GET', 'HEAD'],
						headers: cors.headers ?? [],
					},
				}
			: {}),
		cache: cacheOf(route.cache, defaults.cache),
		crawlable: route.crawlable ?? defaults.crawlable ?? GATEWAY_DEFAULTS.crawlable,
		exposed: route.exposed ?? defaults.exposed ?? GATEWAY_DEFAULTS.exposed,
		forbidden: route.forbidden ?? defaults.forbidden ?? GATEWAY_DEFAULTS.forbidden,
		auth: route.auth ?? defaults.auth ?? GATEWAY_DEFAULTS.auth,
	};
}

/**
 * `service`'s declaration, checked and resolved: its routes most specific first, then `/*`, which
 * is its defaults. Throws naming the service and what is wrong with it.
 */
export function routesOf(service: string, api: unknown): Route[] {
	const parsed = v.safeParse(ApiSchema, api ?? {});
	if (!parsed.success) {
		const [issue] = parsed.issues;
		const where = issue?.path?.map((step) => String(step.key)).join('.') ?? '';
		throw new Error(`${service}: [api]${where ? `.${where}` : ''}: ${issue?.message}`);
	}
	const defaults = parsed.output.defaults ?? {};
	const declared = parsed.output.routes ?? [];
	const seen = new Set<string>();
	for (const { path } of declared) {
		if (path === '/*') throw new Error(`${service}: /* is [api.defaults], not a route`);
		if (seen.has(path)) throw new Error(`${service}: ${path} is declared twice`);
		seen.add(path);
	}
	return [
		...declared
			.toSorted((a, b) => specificity(a.path, b.path))
			.map(({ path, ...route }) => resolve(path, route, defaults)),
		resolve('/*', {}, defaults),
	];
}

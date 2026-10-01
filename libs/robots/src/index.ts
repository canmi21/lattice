import { URLS } from '@canmi/urls';

/**
 * Every host's robots policy, declared here by service and nowhere else. See
 * spec/architecture/robots.md.
 */

/** The opening every policy shares. */
export const robotsTxtBase = [`# ${URLS.external.robotstxt}`, 'User-agent: *'] as const;

/**
 * How a page's content may be used, said once and written in both spellings: Cloudflare's
 * `Content-Signal` and the IETF AI Preferences draft's `Content-Usage`. Only a service that
 * serves pages says it; a store of bytes or an API has rules and nothing more.
 */
export const SIGNALS = { search: true, aiInput: true, aiTrain: true } as const;

const yes = (value: boolean, word: string, no: string) => (value ? word : no);

export const signalLines = [
	`Content-Signal: search=${yes(SIGNALS.search, 'yes', 'no')}, ai-input=${yes(SIGNALS.aiInput, 'yes', 'no')}, ai-train=${yes(SIGNALS.aiTrain, 'yes', 'no')}`,
	`Content-Usage: search=${yes(SIGNALS.search, 'y', 'n')}, ai-use=${yes(SIGNALS.aiInput, 'y', 'n')}, train-ai=${yes(SIGNALS.aiTrain, 'y', 'n')}`,
] as const;

export type RobotsTxtOptions = {
	allow?: readonly string[];
	disallow?: readonly string[];
	/** Whether the host serves pages, and so says how their content may be used. */
	signals?: boolean;
	sitemap?: string | readonly string[] | null;
};

export function robotsTxt(options: RobotsTxtOptions = {}): string {
	// Annotated as string[]: robotsTxtBase is `as const`, so spreading it without this infers
	// a tuple of literal types that nothing else can be pushed into.
	const lines: string[] = [...robotsTxtBase];

	for (const path of options.allow ?? []) {
		lines.push(`Allow: ${path}`);
	}

	for (const path of options.disallow ?? []) {
		lines.push(`Disallow: ${path}`);
	}

	if (options.signals) lines.push(...signalLines);

	const sitemaps = toList(options.sitemap);
	if (sitemaps.length > 0) {
		lines.push('');
		for (const sitemap of sitemaps) {
			lines.push(`Sitemap: ${sitemap}`);
		}
	}

	return `${lines.join('\n')}\n`;
}

/** The services that answer `/robots.txt`, by their internal names. */
export type RobotsService = 'site' | 'status' | 'cdn' | 'aka' | 'api';

/**
 * What each service lets a crawler fetch. The site keeps its internal namespace out; the API lets
 * in the one scope a rendered page asks, so a crawler that runs the page can fetch what it fetches,
 * and nothing else.
 */
export const ROBOTS: Readonly<Record<RobotsService, RobotsTxtOptions>> = {
	site: {
		disallow: ['/@/'],
		signals: true,
		sitemap: `${URLS.apps.production.site}/sitemap.xml`,
	},
	status: { signals: true },
	cdn: { disallow: [''] },
	aka: { disallow: [''] },
	api: { allow: [`${new URL(URLS.apps.production.api).pathname}/`], disallow: ['/'] },
};

/** A service's `robots.txt`. */
export function robotsFor(service: RobotsService): string {
	return robotsTxt(ROBOTS[service]);
}

// Narrow on `typeof value === 'string'` rather than Array.isArray: Array.isArray narrows to
// the mutable `any[]`, which leaves a `readonly string[]` sitting in the false branch.
function toList(value: string | readonly string[] | null | undefined): readonly string[] {
	if (!value) return [];
	return typeof value === 'string' ? [value] : value;
}

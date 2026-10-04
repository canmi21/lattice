import { agentNote, type Service } from '../../security/src/agents.ts';
import { URLS } from '../../src/index.ts';

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

/** Each spelling as a name and a value: a robots.txt line, and a header on a page or markdown. */
export const SIGNAL_HEADERS = [
	[
		'Content-Signal',
		`search=${yes(SIGNALS.search, 'yes', 'no')}, ai-input=${yes(SIGNALS.aiInput, 'yes', 'no')}, ai-train=${yes(SIGNALS.aiTrain, 'yes', 'no')}`,
	],
	[
		'Content-Usage',
		`search=${yes(SIGNALS.search, 'y', 'n')}, ai-use=${yes(SIGNALS.aiInput, 'y', 'n')}, train-ai=${yes(SIGNALS.aiTrain, 'y', 'n')}`,
	],
] as const;

export const signalLines = SIGNAL_HEADERS.map(([name, value]) => `${name}: ${value}`) as [
	string,
	string,
];

/**
 * Cloudflare's terms for content signals, as the comment its own generator writes: the three
 * meanings, and the reservation of rights a `no` makes. Worded and wrapped by Cloudflare, so kept
 * as written.
 */
export const SIGNAL_TERMS = [
	'As a condition of accessing this website, you agree to',
	'abide by the following content signals:',
	'',
	'(a)  If a content-signal = yes, you may collect content',
	'for the corresponding use.',
	'(b)  If a content-signal = no, you may not collect content',
	'for the corresponding use.',
	'(c)  If the website operator does not include a content',
	'signal for a corresponding use, the website operator',
	'neither grants nor restricts permission via content signal',
	'with respect to the corresponding use.',
	'',
	'The content signals and their meanings are:',
	'',
	'search: building a search index and providing search',
	'results (e.g., returning hyperlinks and short excerpts',
	"from your website's contents).  Search does not include",
	'providing AI-generated search summaries.',
	'ai-input: inputting content into one or more AI models',
	'(e.g., retrieval augmented generation, grounding, or other',
	'real-time taking of content for generative AI search',
	'answers).',
	'ai-train: training or fine-tuning AI models.',
	'',
	'ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS',
	'RESERVATIONS OF RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN',
	'UNION DIRECTIVE 2019/790 ON COPYRIGHT AND RELATED RIGHTS',
	'IN THE DIGITAL SINGLE MARKET.',
] as const;

export type RobotsTxtOptions = {
	allow?: readonly string[];
	disallow?: readonly string[];
	/** Whether the host serves pages, and so says how their content may be used. */
	signals?: boolean;
	/** The host whose word to an agent sent to break in the file ends with. */
	agent?: Service;
	sitemap?: string | readonly string[] | null;
};

export function robotsTxt(options: RobotsTxtOptions = {}): string {
	// The group's rules first; then, for a page host, the terms and each signal under the address
	// that defines it; then the sitemaps. Each address stands apart on its line. A comment or a
	// blank line does not end a group, so the signals still belong to `User-agent: *`.
	const lines: string[] = [robotsTxtBase[0], '', robotsTxtBase[1]];

	for (const path of options.allow ?? []) {
		lines.push(`Allow: ${path}`);
	}

	for (const path of options.disallow ?? []) {
		lines.push(`Disallow: ${path}`);
	}

	if (options.signals) {
		lines.push('', ...SIGNAL_TERMS.map((line) => (line ? `# ${line}` : '')));
		lines.push('', `# ${URLS.external.contentSignals}`, '', signalLines[0]);
		lines.push('', `# ${URLS.external.contentUsage}`, '', signalLines[1]);
	}

	if (options.agent) lines.push('', ...agentNote('robots', options.agent));

	const sitemaps = toList(options.sitemap);
	if (sitemaps.length > 0) {
		lines.push('');
		for (const sitemap of sitemaps) {
			lines.push(`Sitemap: ${sitemap}`);
		}
	}

	return `${lines.join('\n')}\n`;
}

/**
 * The applications that answer their own `robots.txt`: the service layer's hosts are the gateway's,
 * which writes theirs from the routes they reach. See spec/architecture/gateway.md.
 */
export type RobotsService = 'site' | 'status';

/**
 * The services that serve pages, in the order every sitemap list follows, each with its origin, how
 * often its root changes, and how much the host weighs in the whole of what the author runs -- the
 * priority another host's sitemap gives its root. A host names its own first, and weighs its own
 * pages on its own scale; see spec/architecture/robots.md, "Every page host names every other".
 */
export const PAGE_HOSTS: readonly {
	service: Service;
	origin: string;
	changefreq: string;
	priority: string;
}[] = [
	{ service: 'site', origin: URLS.apps.production.site, changefreq: 'daily', priority: '1.0' },
	{
		service: 'status',
		origin: URLS.internal.status.canonical,
		// It changes as often as it is read.
		changefreq: 'always',
		priority: '0.5',
	},
];

/** `service` first, then every other page host in the shared order. */
function ownFirst(service: Service): (typeof PAGE_HOSTS)[number][] {
	return [
		...PAGE_HOSTS.filter((host) => host.service === service),
		...PAGE_HOSTS.filter((host) => host.service !== service),
	];
}

/** Every page host's sitemap, `service`'s first: what its robots.txt names. */
export function sitemapsFor(service: Service): string[] {
	return ownFirst(service).map((host) => `${host.origin}/sitemap.xml`);
}

function hostOf(service: Service): (typeof PAGE_HOSTS)[number] {
	const host = PAGE_HOSTS.find((candidate) => candidate.service === service);
	if (!host) throw new Error(`${service} serves no pages`);
	return host;
}

/**
 * A page host's root as another host's sitemap lists it: its weight in the whole, and no
 * modification time -- nothing reaches across hosts to read another's.
 */
export function rootEntry(service: Service): SitemapEntry {
	const host = hostOf(service);
	return {
		loc: new URL('/', host.origin).href,
		changefreq: host.changefreq,
		priority: host.priority,
	};
}

/**
 * A page host's root in its own sitemap: how often it changes, as the list says, and the weight
 * the host gives it among its own pages. The host adds its own modification time.
 */
export function ownRoot(service: Service, priority: string): SitemapEntry {
	const host = hostOf(service);
	return { loc: new URL('/', host.origin).href, changefreq: host.changefreq, priority };
}

/**
 * The other page hosts, by their roots alone, for `service`'s sitemap: each lists its own routes,
 * so a host knows the others by name and needs nothing of theirs to build.
 */
export function peerEntries(service: Service): SitemapEntry[] {
	return ownFirst(service)
		.slice(1)
		.map((host) => rootEntry(host.service));
}

/**
 * What each service lets a crawler fetch. The site keeps its internal namespace out; the API lets
 * in the one scope a rendered page asks, so a crawler that runs the page can fetch what it fetches,
 * and nothing else.
 */
export const ROBOTS: Readonly<Record<RobotsService, RobotsTxtOptions>> = {
	site: {
		// `/@/` is the site's internal namespace; the other two are paths Cloudflare answers on
		// every zone, with nothing to index.
		disallow: ['/@/', '/cgi-bin/', '/cdn-cgi/'],
		signals: true,
		agent: 'site',
		sitemap: sitemapsFor('site'),
	},
	status: {
		signals: true,
		agent: 'status',
		sitemap: sitemapsFor('status'),
	},
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

/**
 * Where every sitemap's stylesheet is: a path on the sitemap's own origin, since a browser applies
 * an XSL stylesheet to an XML document only from there. Each origin answers it by following the
 * one shared stylesheet; see spec/architecture/robots.md.
 */
export const SITEMAP_STYLESHEET = '/sitemap.xsl';

export type SitemapEntry = {
	loc: string;
	lastmod?: string;
	changefreq?: string;
	priority?: string;
	alternates?: readonly { language_tag: string; href: string }[];
};

/** A sitemap of `entries`, styled for a browser by `SITEMAP_STYLESHEET`. */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
	const items = entries
		.map((entry) => {
			const parts = [
				`\t\t<loc>${entry.loc}</loc>`,
				...(entry.alternates ?? []).map(
					(alternate) =>
						`\t\t<xhtml:link rel="alternate" hreflang="${alternate.language_tag}" href="${alternate.href}" />`,
				),
				...(entry.lastmod ? [`\t\t<lastmod>${entry.lastmod}</lastmod>`] : []),
				...(entry.changefreq ? [`\t\t<changefreq>${entry.changefreq}</changefreq>`] : []),
				...(entry.priority ? [`\t\t<priority>${entry.priority}</priority>`] : []),
			];
			return `\t<url>\n${parts.join('\n')}\n\t</url>`;
		})
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="${SITEMAP_STYLESHEET}"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${items}
</urlset>
`;
}

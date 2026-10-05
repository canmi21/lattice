import type { RequestEvent } from '@sveltejs/kit';
import { building, dev } from '$app/env';
import { fillTheme, themeOf } from '@canmi/kit/theme';
import { normalizedLocation, URLS } from '@monoflake/sdk';
import { serverHandles } from '@canmi/web/sentry/server';
import { handleErrorWithSentry } from '@sentry/sveltekit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { articleRailScript } from '@canmi/prose/rail';
import { articleHashScript } from '@canmi/prose/toc';
import { videoGroundScript } from '#lib/client/ground.js';
import { measuredGroundScript } from '#lib/client/measured-ground.js';
import {
	LANGUAGE_COOKIE_MAX_AGE,
	languageTag,
	type LocaleCode,
	privateHtml,
	resolveLocale,
	SITE_LANGUAGE,
} from '#lib/locale/index.js';
import { HOME_SLUG } from '#lib/opengraph.js';
import { SIGNAL_HEADERS } from '@canmi/me/robots';
import { articleAgentView, homeAgentView, pageAddress } from '#lib/server/agent-pages.js';
import { prefersMarkdown, tokensIn } from '#lib/server/markdown.js';
import { publishedMarkdown, publishedMetadata } from '#lib/published/index.js';
import { answer as apiAnswer } from '#lib/server/api.js';
import { registerServerStrategy } from '#lib/locale/paraglide.js';

registerServerStrategy();

// Serve every page's agent view at <url>.md (the llms.txt convention), and at the page's own
// address to a reader asking for markdown. See spec/architecture/markdown.md.
const markdownHandle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	// The llms.txt convention's names for a root page's view, kept to the one this site has.
	if (pathname === '/index.html.md' || pathname === '/index.md') {
		return new Response(null, { status: 301, headers: { Location: `/${HOME_SLUG}.md` } });
	}
	if (pathname.endsWith('.md')) {
		// The identity, which is the last segment: `/mirror/a-b.md` and `/homepage.md` alike.
		const asked = pathname.slice(1, -3);
		// `/.md` is the view of `/`, and `/` is the homepage, filed under its own slug. The page
		// side redirects the other way -- `/homepage` bounces to `/` below -- because each side has
		// a different canonical address for the one thing. Asked with no identity at all, the API
		// answers 400 to an empty slug and `answer` throws, so `/.md` was a 500.
		if (!identityIn(asked)) {
			return new Response(null, { status: 302, headers: { Location: `/${HOME_SLUG}.md` } });
		}
		const found = await publishedMarkdown(event.fetch, identityIn(asked));
		if (found) {
			// A document is redirected on the same terms a page is, because a view served at every
			// address that reaches it is the same duplicate-content shape. See
			// spec/architecture/site-api.md, "Reaching an article by name".
			if (found.path !== asked) {
				const permanent = asked.includes('/');
				return new Response(null, {
					status: permanent ? 301 : 302,
					headers: { Location: `/${found.path}.md` },
				});
			}
			const answered = await agentAnswer(event.fetch, found.path);
			if (answered) return answered;
		}
	}
	if (prefersMarkdown(event.request.headers.get('accept')) && !DOCUMENT_PATH.test(pathname)) {
		const asked = pathname === '/' ? HOME_SLUG : pathname.replace(/^\/+|\/+$/g, '');
		const found = asked ? await publishedMarkdown(event.fetch, identityIn(asked)) : undefined;
		if (found && found.path === asked) {
			const code = resolveLocale({
				query: event.url.searchParams.get('lang'),
				cookie: event.cookies.get('language'),
				acceptLanguage: event.request.headers.get('accept-language'),
			});
			const answered = await agentAnswer(event.fetch, found.path, code);
			if (answered) return answered;
		}
	}
	return resolve(event);
};

/**
 * A page's agent view, as a response. Asked for at the page's own address -- `code` given -- it
 * says where the asked language is when it is another, and varies by what was asked, so nothing
 * shared may keep it.
 */
async function agentAnswer(
	fetch: typeof globalThis.fetch,
	path: string,
	code?: LocaleCode,
): Promise<Response | undefined> {
	const now = new Date();
	const view =
		path === HOME_SLUG
			? await homeAgentView(fetch, code, now)
			: await articleAgentView(fetch, identityIn(path), code, now);
	if (!view) return undefined;
	const headers = new Headers({
		'Content-Type': 'text/markdown; charset=utf-8',
		'Content-Language': view.language,
		'Cache-Control': code ? 'private, no-store' : 'public, max-age=300, s-maxage=300',
		'x-markdown-tokens': String(tokensIn(view.body)),
		Link: `<${pageAddress(path)}>; rel="canonical"`,
	});
	for (const [name, value] of SIGNAL_HEADERS) headers.set(name, value);
	if (code) {
		headers.set('Vary', 'Accept');
		headers.set('Content-Location', `/${path}.md`);
	}
	return new Response(view.body, { headers });
}

/**
 * A request for a document rather than a page.
 *
 * Why a document is recognized by having an extension, why that is written as the exception
 * rather than a list of pages, and the routes this test has to carve out on top of it -- see
 * spec/locale/addressing.md, "Every page negotiates; the exceptions are documents".
 */
const DOCUMENT_PATH = /\.[^./]+$/;

/**
 * The identity in an address: its last segment.
 *
 * Every question about an article asks by slug alone -- a slug is unique whatever directory holds
 * it, so the directory is the address and never part of the name. A standalone page has no
 * directory, so the same test returns the page itself. See spec/architecture/site-api.md, "A slug
 * is the identity and the path is the address".
 */
function identityIn(path: string): string {
	return (
		path
			.replace(/^\/+|\/+$/g, '')
			.split('/')
			.at(-1) ?? ''
	);
}

/** The route every page that is not one of this site's own fixed addresses resolves to. */
const PAGE_ROUTE = '/[...path]';

/**
 * The public language tag of the view about to be served.
 *
 * Only `mw` has to be asked for: it means the article's own language, which now travels in the
 * published view rather than in a corpus compiled into this Worker. The answer is the same one
 * the page load is about to ask for, so the two share one request. See spec/locale/addressing.md,
 * "`mw` is the article's language, not a language".
 */
async function resolvedTag(event: RequestEvent, code: LocaleCode): Promise<string> {
	if (code !== 'mw' || event.route.id !== PAGE_ROUTE) return languageTag(code, SITE_LANGUAGE);
	const found = await publishedMetadata(event.fetch, identityIn(event.url.pathname), 'mw').catch(
		() => undefined,
	);
	return found?.locale.language_tag ?? SITE_LANGUAGE;
}

const pageHandle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	// The homepage renders at /, but its source is contents/homepage.md, so the
	// markdown stays reachable at /homepage.md; bounce the bare page path to /.
	if (pathname === '/homepage') {
		return new Response(null, { status: 302, headers: { location: '/' } });
	}
	// Browser-facing HTML negotiates from every reader preference, which is every page. The
	// catch-all route is what the article lookup used to be here, so a slug that happens to carry
	// a dot is still a page. Package versions contain dots while the route still serves HTML. The
	// explicit browser namespace wins over the extension convention before the generic document
	// test runs.
	const isPage = event.route.id === PAGE_ROUTE;
	const localeAware =
		pathname.startsWith('/licenses/pkgs/') || isPage || !DOCUMENT_PATH.test(pathname);
	if (localeAware && !building) {
		const cookie = event.cookies.get('language');
		const code = resolveLocale({
			query: event.url.searchParams.get('lang'),
			cookie,
			acceptLanguage: event.request.headers.get('accept-language'),
		});
		event.locals.locale = { code, language_tag: await resolvedTag(event, code) };
		// Rewrite even an unchanged value so cookies created before client-side switching was
		// introduced lose HttpOnly and become writable by the language controls.
		event.cookies.set('language', code, {
			path: '/',
			maxAge: LANGUAGE_COOKIE_MAX_AGE,
			sameSite: 'lax',
			httpOnly: false,
		});
	}
	// Settled once and used twice: the class the document is painted from, and the value a control
	// renders from. A control that read the class back would be deriving what is already known.
	const theme = themeOf(event.cookies);
	event.locals.theme = theme;
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			hoistCharset(
				fillTheme(html, theme)
					.replace('%language.tag%', event.locals.locale?.language_tag ?? 'en-US') // The internal code for the client-side Paraglide strategy. The rendered
					// document is the authoritative result of the worker's full negotiation.
					.replace('%language.code%', event.locals.locale?.code ?? 'mw')
					.replace('%article.hash.script%', isPage ? articleHashScript : '')
					.replace('%video.ground.script%', videoGroundScript)
					.replace('%measured.ground.script%', measuredGroundScript)
					.replace('%article.rail.script%', articleRailScript),
			),
	});
	const html = privateHtml(response);
	// A patch for Wappalyzer, which knows Hono only by this header and reads the page's alone; the
	// API this Worker answers with is Hono. See lib's spec/web/disclose.md.
	html.headers.set('X-Powered-By', 'Hono');
	// A page and its markdown are one address: say so, and say where the markdown is. See
	// spec/architecture/markdown.md.
	if ((isPage || pathname === '/') && html.status === 200) {
		html.headers.append('Vary', 'Accept');
		html.headers.append(
			'Link',
			`<${pathname === '/' ? `/${HOME_SLUG}` : pathname}.md>; rel="alternate"; type="text/markdown"`,
		);
		for (const [name, value] of SIGNAL_HEADERS) html.headers.set(name, value);
	}
	return html;
};

/**
 * Move the encoding declaration to the front of `<head>`.
 *
 * Lands second, not first: `sequence` nests handlers so the earliest-listed transforms last, and
 * Sentry has to be listed first, so its trace tag always precedes this. Second is enough --
 * the standard asks for the declaration inside the first 1024 bytes, and this brings it from 629
 * to 386, preceded only by ASCII hex no decoder can read two ways. Not noted in app.html, since a
 * comment there would be copied into every page ever served.
 */
function hoistCharset(html: string): string {
	const charset = /\s*<meta charset="[^"]*"\s*\/?>/i.exec(html);
	if (!charset || !html.includes('<head>')) return html;
	return html.replace(charset[0], '').replace('<head>', `<head>${charset[0].trim()}`);
}

/**
 * The headers every response carries, set here and nowhere else.
 *
 * Why `Referrer-Policy` is `origin-when-cross-origin` and every link out is `noopener` without
 * `noreferrer`, and why all three headers are set in the repository rather than at the edge --
 * see spec/referrer.md. Listed before the markdown handler, which returns without resolving, so
 * its responses carry them too.
 */
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
	['Referrer-Policy', 'origin-when-cross-origin'],
	['X-Frame-Options', 'SAMEORIGIN'],
	['X-Content-Type-Options', 'nosniff'],
];

const securityHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [name, value] of SECURITY_HEADERS) response.headers.set(name, value);
	return response;
};

// One spelling per address: a path that normalizes differently goes where it should.
// See platform's spec/architecture/delivery.md, "Every address has one spelling".
const spellingHandle: Handle = ({ event, resolve }) => {
	const normal = normalizedLocation(event.url);
	return normal
		? new Response(null, { status: normal.status, headers: { location: normal.location } })
		: resolve(event);
};

// The site's API, before anything that would read the path as a page's.
const apiHandle: Handle = async ({ event, resolve }) => (await apiAnswer(event)) ?? resolve(event);

export const handle = sequence(
	...serverHandles({ dsn: URLS.external.sentry.site, dev }),
	spellingHandle,
	securityHandle,
	apiHandle,
	markdownHandle,
	pageHandle,
);

/** The same stamp from the other side; see hooks.client.ts. */
export const handleError = handleErrorWithSentry(({ kind }) =>
	kind === 'unknown' ? { origin: 'server' as const } : undefined,
);

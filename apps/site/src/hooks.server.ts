import { building, dev } from '$app/environment';
import { themeScript } from '@canmi/theme';
import { URLS } from '@canmi/urls';
import { handleErrorWithSentry, initCloudflareSentryHandle, sentryHandle } from '@sentry/sveltekit';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { articleRailScript } from '$lib/article/rail';
import { articleHashScript } from '$lib/article/toc';
import { videoGroundScript } from '$lib/client/ground';
import {
	LANGUAGE_COOKIE_MAX_AGE,
	languageTag,
	type LocaleCode,
	privateHtml,
	resolveLocale,
	SITE_LANGUAGE,
} from '$lib/locale';
import { publishedMarkdown, publishedMetadata } from '$lib/published';
import { registerServerStrategy } from '$lib/locale/paraglide';

registerServerStrategy();

// Serve clean markdown at <url>.md (llms.txt convention) generically, without a
// per-target route — for articles and standalone pages (e.g. /homepage.md).
const markdownHandle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (pathname.endsWith('.md')) {
		// The identity, which is the last segment: `/mirror/a-b.md` and `/homepage.md` alike.
		const asked = pathname.slice(1, -3);
		const found = await publishedMarkdown(event.fetch, identityIn(asked));
		if (found) {
			// A document is redirected on the same terms a page is, because a source served at
			// every address that reaches it is the same duplicate-content shape. See
			// spec/architecture/artifacts.md, "Reaching an article by name".
			if (found.path !== asked) {
				const permanent = asked.includes('/');
				return new Response(null, {
					status: permanent ? 301 : 302,
					headers: { Location: `/${found.path}.md` },
				});
			}
			return new Response(found.body.body, {
				headers: {
					'Content-Type': 'text/markdown; charset=utf-8',
					'Cache-Control': 'public, max-age=300, s-maxage=300',
				},
			});
		}
	}
	return resolve(event);
};

/**
 * A request for a document rather than a page.
 *
 * Why a document is recognised by having an extension, why that is written as the exception
 * rather than a list of pages, and the routes this test has to carve out on top of it -- see
 * spec/locale/addressing.md, "Every page negotiates; the exceptions are documents".
 */
const DOCUMENT_PATH = /\.[^./]+$/;

/**
 * The identity in an address: its last segment.
 *
 * Every question about an article asks by slug alone -- a slug is unique whatever directory holds
 * it, so the directory is the address and never part of the name. A standalone page has no
 * directory, so the same test returns the page itself. See spec/architecture/artifacts.md,
 * "A slug is the identity and the path is the address".
 */
function identityIn(path: string): string {
	return path.replace(/^\/+|\/+$/g, '').split('/').at(-1) ?? '';
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
	const theme = event.cookies.get('theme') === 'dark' ? 'dark' : 'light';
	event.locals.theme = theme;
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			hoistCharset(
				html
					.replace('%language.tag%', event.locals.locale?.language_tag ?? 'en-US')
					// The internal code for the client-side Paraglide strategy. The rendered
					// document is the authoritative result of the worker's full negotiation.
					.replace('%language.code%', event.locals.locale?.code ?? 'mw')
					.replace('%theme.class%', theme === 'dark' ? 'dark' : '')
					.replace('%theme.script%', themeScript)
					.replace('%article.hash.script%', isPage ? articleHashScript : '')
					.replace('%video.ground.script%', videoGroundScript)
					.replace('%article.rail.script%', articleRailScript),
			),
	});
	return privateHtml(response);
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

export const handle = sequence(
	initCloudflareSentryHandle({
		dsn: URLS.external.sentry.site,
		enabled: !dev,
		environment: dev ? 'development' : 'production',
	}),
	sentryHandle(),
	securityHandle,
	markdownHandle,
	pageHandle,
);

/** The same stamp from the other side; see hooks.client.ts. */
export const handleError = handleErrorWithSentry(
	({ message }): App.Error => ({ message, origin: 'server' }),
);

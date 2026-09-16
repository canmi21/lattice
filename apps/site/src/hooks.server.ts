import { building, dev } from '$app/environment';
import { themeScript } from '@canmi/theme';
import { URLS } from '@canmi/urls';
import { handleErrorWithSentry, initCloudflareSentryHandle, sentryHandle } from '@sentry/sveltekit';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { articleRailScript } from '$lib/article/rail';
import { articleHashScript } from '$lib/article/toc';
import { videoGroundScript } from '$lib/client/ground';
import { getArticle, getPage } from '$lib/content';
import {
	LANGUAGE_COOKIE_MAX_AGE,
	languageTag,
	privateHtml,
	resolveLocale,
	SITE_LANGUAGE,
} from '$lib/locale';
import { registerServerStrategy } from '$lib/locale/paraglide';

registerServerStrategy();

// Serve clean markdown at <url>.md (llms.txt convention) generically, without a
// per-target route — for articles and standalone pages (e.g. /homepage.md).
const markdownHandle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (pathname.endsWith('.md')) {
		const slug = pathname.slice(1, -3);
		const markdown = (await getArticle(slug))?.markdown ?? getPage(slug)?.markdown;
		if (markdown) {
			return new Response(markdown, {
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
 * spec/locale.md, "Every page negotiates; the exceptions are documents".
 */
const DOCUMENT_PATH = /\.[^./]+$/;

const pageHandle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	// The homepage renders at /, but its source is contents/homepage.md, so the
	// markdown stays reachable at /homepage.md; bounce the bare page path to /.
	if (pathname === '/homepage') {
		return new Response(null, { status: 302, headers: { location: '/' } });
	}
	const path = pathname.replace(/^\//, '').replace(/\/$/, '');
	const article = getArticle(path);
	// Browser-facing HTML negotiates from every reader preference, which is every page. The
	// article lookup comes first so a slug that happens to carry a dot is still a page.
	// Package versions contain dots while the route still serves HTML. The explicit browser
	// namespace wins over the extension convention before the generic document test runs.
	const localeAware =
		pathname.startsWith('/licenses/pkgs/') || article != null || !DOCUMENT_PATH.test(pathname);
	if (localeAware && !building) {
		const cookie = event.cookies.get('language');
		const code = resolveLocale({
			query: event.url.searchParams.get('lang'),
			cookie,
			acceptLanguage: event.request.headers.get('accept-language'),
		});
		event.locals.locale = {
			code,
			languageTag: languageTag(code, article?.meta.lang ?? SITE_LANGUAGE),
		};
		// Rewrite even an unchanged value so cookies created before client-side switching was
		// introduced lose HttpOnly and become writable by the language controls.
		event.cookies.set('language', code, {
			path: '/',
			maxAge: LANGUAGE_COOKIE_MAX_AGE,
			sameSite: 'lax',
			httpOnly: false,
		});
	}
	const theme = event.cookies.get('theme');
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			hoistCharset(
				html
					.replace('%language.tag%', event.locals.locale?.languageTag ?? 'en-US')
					// The internal code for the client-side Paraglide strategy. The rendered
					// document is the authoritative result of the worker's full negotiation.
					.replace('%language.code%', event.locals.locale?.code ?? 'mw')
					.replace('%theme.class%', theme === 'dark' ? 'dark' : '')
					.replace('%theme.script%', themeScript)
					.replace('%article.hash.script%', article ? articleHashScript : '')
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

export const handleError = handleErrorWithSentry();

import type { ClientInit } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { takeParameter } from '@canmi/web/referer';
import { disclose } from '@canmi/web/disclose';
import { prepareBrowserRuntime } from '@canmi/web/compat';
import { URLS } from '@monoflake/sdk';
import { initClient } from '@canmi/web/sentry/client';
import { handleErrorWithSentry } from '@sentry/sveltekit';
import { registerAnalytics } from '#lib/analytics.js';
import { registerClientStrategy } from '#lib/locale/paraglide.js';

registerClientStrategy();
registerAnalytics();

// The lite search client sets no global, and asks Algolia only on a search; Motion's `animate`
// sets none either, only its React components do. See lib's spec/web/disclose.md.
disclose({
	'__algolia.algoliasearch.version': import.meta.env.VITE_ALGOLIA_VERSION,
	MotionIsMounted: true,
});

// The feedback dialog is deliberately absent here. Naming it in `integrations` puts its widget
// in the app entry, which every reader downloads for a control that only the error page has --
// measured at 24KB gzipped. It is added on demand instead; see lib/error/report.ts.
initClient({ dsn: URLS.external.sentry.site, dev });

export const init: ClientInit = prepareBrowserRuntime;
/**
 * Every unexpected error that happens in the browser, stamped as this side's.
 *
 * Every error reaches here since SvelteKit 3, but only an unknown one -- thrown by code, rather
 * than by `error()` or by SvelteKit itself -- is stamped; the rest keep the status and message
 * they came with. So an `origin` is the page's signal that something broke rather than that a
 * question was answered. See app.d.ts and routes/+error.svelte.
 */
export const handleError = handleErrorWithSentry(({ kind }) =>
	kind === 'unknown' ? { origin: 'client' as const } : undefined,
);

function cleanLanguageParameter(): void {
	takeParameter('lang');
}

// The Worker has already selected and persisted the view. Address-bar cleanup is deliberately
// deferred until load, so it can neither block rendering nor race the request that used `lang`.
if (document.readyState === 'complete') cleanLanguageParameter();
else window.addEventListener('load', cleanLanguageParameter, { once: true });

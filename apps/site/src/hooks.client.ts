import { dev } from '$app/environment';
import { URLS } from '@canmi/urls';
import * as Sentry from '@sentry/sveltekit';
import type { ClientInit } from '@sveltejs/kit';
import { registerAnalytics } from '$lib/analytics';
import { prepareBrowserRuntime } from '$lib/client/compatibility';
import { withoutLanguageParameter } from '$lib/locale';
import { registerClientStrategy } from '$lib/locale/paraglide';

registerClientStrategy();
registerAnalytics();

// The feedback dialog is deliberately absent here. Naming it in `integrations` puts its widget
// in the app entry, which every reader downloads for a control that only the error page has --
// measured at 24KB gzipped. It is added on demand instead; see lib/error/report.ts.
//
// `enabled: false` sets up no integrations, so a disabled client has none to find. Adding one to
// it still works, which is why the dialog can be opened in development at all.
Sentry.init({
	dsn: URLS.external.sentry.site,
	enabled: !dev,
	environment: dev ? 'development' : 'production',
});

export const init: ClientInit = prepareBrowserRuntime;
/**
 * Every unexpected error that happens in the browser, stamped as this side's.
 *
 * Only unexpected ones reach here -- an `error()` carries its own body straight to the page --
 * so an `origin` is the page's signal that something broke rather than that a question was
 * answered. See app.d.ts and routes/+error.svelte.
 */
export const handleError = Sentry.handleErrorWithSentry(({ message }): App.Error => ({
	message,
	origin: 'client',
}));

function cleanLanguageParameter(): void {
	const replacement = withoutLanguageParameter(new URL(window.location.href));
	if (replacement) history.replaceState(history.state, '', replacement);
}

// The Worker has already selected and persisted the view. Address-bar cleanup is deliberately
// deferred until load, so it can neither block rendering nor race the request that used `lang`.
if (document.readyState === 'complete') cleanLanguageParameter();
else window.addEventListener('load', cleanLanguageParameter, { once: true });

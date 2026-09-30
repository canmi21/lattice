import { dev } from '$app/environment';
import { prepareBrowserRuntime } from '@canmi/compat';
import { initClient } from '@canmi/sentry/client';
import { URLS } from '@canmi/urls';
import { handleErrorWithSentry } from '@sentry/sveltekit';
import type { ClientInit } from '@sveltejs/kit';

// Nothing is initialized when the DSN is unset.
initClient({ dsn: URLS.external.sentry.status, dev });

export const handleError = handleErrorWithSentry();

export const init: ClientInit = prepareBrowserRuntime;

import type { ClientInit } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { prepareBrowserRuntime } from '@canmi/compat';
import { initClient } from '@canmi/sentry/client';
import { URLS } from '@canmi/urls';
import { handleErrorWithSentry } from '@sentry/sveltekit';

// Nothing is initialized when the DSN is unset.
initClient({ dsn: URLS.external.sentry.status, dev });

export const handleError = handleErrorWithSentry();

export const init: ClientInit = prepareBrowserRuntime;

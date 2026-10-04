import type { ClientInit } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { prepareBrowserRuntime } from '@canmi/web/compat';
import { initClient } from '@canmi/web/sentry/client';
import { URLS } from '@monoflake/sdk';
import { handleErrorWithSentry } from '@sentry/sveltekit';

// Nothing is initialized when the DSN is unset.
initClient({ dsn: URLS.external.sentry.status, dev });

export const handleError = handleErrorWithSentry();

export const init: ClientInit = prepareBrowserRuntime;

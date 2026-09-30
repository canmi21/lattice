import { dev } from '$app/environment';
import { initClient } from '@canmi/sentry/client';
import { URLS } from '@canmi/urls';
import { handleErrorWithSentry } from '@sentry/sveltekit';

// Nothing is initialized when the DSN is unset.
initClient({ dsn: URLS.external.sentry.status, dev });

export const handleError = handleErrorWithSentry();

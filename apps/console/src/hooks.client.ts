import { dev } from '$app/env';
import { EXTERNAL } from '@canmi/me/urls';
import { initClient } from '@canmi/web/sentry/client';
import { handleErrorWithSentry } from '@sentry/sveltekit';

// Loaded in development as in production, and sent only from production; see
// spec/architecture/console.md, "Errors go to Sentry, and development sends nothing".
initClient({ dsn: EXTERNAL.sentry.console, dev });

export const handleError = handleErrorWithSentry();

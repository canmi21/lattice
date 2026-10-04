import { securityFor } from '@canmi/robots';
import type { RequestHandler } from './$types';

// Rendered per request, so its expiry moves forward on its own.
export const prerender = false;

export const GET: RequestHandler = ({ request }) => securityFor(request, 'site');

import { robotsFor } from '@canmi/robots';
import type { RequestHandler } from './$types';

// The status page's policy is this repository's robots library's, beside the site's.
export const GET: RequestHandler = () =>
	new Response(robotsFor('status'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

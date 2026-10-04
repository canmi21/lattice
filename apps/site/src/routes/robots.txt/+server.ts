import { robotsFor } from '@canmi/robots';
import type { RequestHandler } from './$types';

export const prerender = true;

// The site's policy is this repository's robots library's, beside the status page's.
export const GET: RequestHandler = () =>
	new Response(robotsFor('site'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

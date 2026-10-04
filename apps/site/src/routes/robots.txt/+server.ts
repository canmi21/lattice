import { robotsFor } from '@monoflake/robots';
import type { RequestHandler } from './$types';

export const prerender = true;

// The site's policy is the robots library's, beside every other host's.
export const GET: RequestHandler = () =>
	new Response(robotsFor('site'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

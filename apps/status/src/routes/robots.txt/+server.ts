import { robotsFor } from '@monoflake/sdk/robots';
import type { RequestHandler } from './$types';

// The status page's policy is the robots library's, beside every other host's.
export const GET: RequestHandler = () =>
	new Response(robotsFor('status'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

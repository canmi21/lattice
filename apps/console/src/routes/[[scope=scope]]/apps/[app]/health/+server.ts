import { success } from '@canmi/response';
import { healthReads } from '#lib/apps/read.js';
import { edgeOf } from '#lib/server/platform.js';
import type { RequestHandler } from './$types';

/**
 * Every node's check of the app's health, asked again by its page while it is open; the page's
 * first is streamed by its load. See src/lib/apps/health.ts.
 */
export const GET: RequestHandler = async (event) =>
	success(await healthReads(edgeOf(event), event.params.app), {
		headers: { 'cache-control': 'no-store' },
	});

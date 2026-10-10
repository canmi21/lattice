import { order, type Whereabouts } from '#lib/server/nodes.js';
import { served } from '#lib/ui/time-zone.js';
import type { LayoutServerLoad } from './$types';

/**
 * The reader's zone, from their cookie or Cloudflare's guess -- see src/lib/ui/time-zone.ts -- and
 * the node nearest them, from where Cloudflare says they are and without asking any, so the first
 * paint names the relay the socket goes to first.
 */
export const load: LayoutServerLoad = (event) => ({
	zone: served(event.cookies, event.request.cf as { timezone?: string } | undefined),
	nearest: order(event.request.cf as Whereabouts | undefined)[0],
});

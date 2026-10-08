import { order, type Whereabouts } from '#lib/server/nodes.js';
import { known } from '#lib/ui/time-zone.js';
import type { LayoutServerLoad } from './$types';

/**
 * The reader's zone as Cloudflare names it -- see src/lib/ui/time-zone.ts -- and the node nearest
 * them, from where Cloudflare says they are and without asking any, so the first paint names the
 * relay the socket goes to first.
 */
export const load: LayoutServerLoad = (event) => ({
	zone: known((event.request.cf as { timezone?: string } | undefined)?.timezone),
	nearest: order(event.request.cf as Whereabouts | undefined)[0],
});

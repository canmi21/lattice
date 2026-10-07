import { known } from '#lib/ui/time-zone.js';
import type { LayoutServerLoad } from './$types';

/** The reader's zone, as Cloudflare names it on the request; see src/lib/ui/time-zone.ts. */
export const load: LayoutServerLoad = (event) => ({
	zone: known((event.request.cf as { timezone?: string } | undefined)?.timezone),
});

import { SESSION, tryRead } from '#lib/server/core.js';
import type { Route } from '#lib/api.js';
import type { PageServerLoad } from '././$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	routes: await tryRead<Route[]>('/api/routes', cookies.get(SESSION)),
});

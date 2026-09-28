import { SESSION, tryRead } from '$lib/server/core';
import type { Route } from '$lib/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	routes: await tryRead<Route[]>('/api/routes', cookies.get(SESSION)),
});

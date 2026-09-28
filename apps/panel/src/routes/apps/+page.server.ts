import { SESSION, tryRead } from '$lib/server/core';
import type { App } from '$lib/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	apps: await tryRead<App[]>('/api/apps', cookies.get(SESSION)),
});

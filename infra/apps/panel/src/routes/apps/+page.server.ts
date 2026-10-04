import { SESSION, tryRead } from '#lib/server/core.js';
import type { App } from '#lib/api.js';
import type { PageServerLoad } from '././$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	apps: await tryRead<App[]>('/api/apps', cookies.get(SESSION)),
});

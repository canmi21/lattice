import { SESSION, tryRead } from '#lib/server/core.js';
import type { App } from '#lib/api.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }) => ({
	app: await tryRead<App>(`/api/apps/${encodeURIComponent(params.name)}`, cookies.get(SESSION)),
});

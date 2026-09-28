import { SESSION, tryRead } from '$lib/server/core';
import type { App } from '$lib/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }) => ({
	app: await tryRead<App>(`/api/apps/${encodeURIComponent(params.name)}`, cookies.get(SESSION)),
});

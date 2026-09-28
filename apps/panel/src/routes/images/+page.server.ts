import { SESSION, tryRead } from '$lib/server/core';
import type { Images } from '$lib/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	images: await tryRead<Images>('/api/images', cookies.get(SESSION)),
});

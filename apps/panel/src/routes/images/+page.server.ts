import { SESSION, tryRead } from '$lib/server/core';
import type { Image } from '$lib/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	images: await tryRead<{ images: Image[]; size: number | null }>(
		'/api/images',
		cookies.get(SESSION),
	),
});

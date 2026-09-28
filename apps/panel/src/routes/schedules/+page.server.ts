import { SESSION } from '$lib/server/core';
import { tryReadCron } from '$lib/server/cron';
import type { Schedule } from '$lib/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	schedules: await tryReadCron<Schedule[]>('/schedules', '', cookies.get(SESSION)),
});

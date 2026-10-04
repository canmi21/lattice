import { SESSION } from '#lib/server/core.js';
import { tryReadCron } from '#lib/server/cron.js';
import type { Schedule } from '#lib/api.js';
import type { PageServerLoad } from '././$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	schedules: await tryReadCron<Schedule[]>('/schedules', '', cookies.get(SESSION)),
});

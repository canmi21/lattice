import { SESSION } from '#lib/server/core.js';
import { tryReadLedger } from '#lib/server/ledger.js';
import { TASK_PAGE_SIZE, type Task } from '#lib/api.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	tasks: await tryReadLedger<Task[]>('/tasks', `?limit=${TASK_PAGE_SIZE}`, cookies.get(SESSION)),
});

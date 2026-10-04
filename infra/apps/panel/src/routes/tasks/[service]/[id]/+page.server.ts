import { SESSION } from '#lib/server/core.js';
import { tryReadLedger } from '#lib/server/ledger.js';
import type { TaskDetail } from '#lib/api.js';
import type { PageServerLoad } from '././$types';

export const load: PageServerLoad = async ({ cookies, params }) => ({
	service: params.service,
	id: params.id,
	detail: await tryReadLedger<TaskDetail>(
		`/tasks/${encodeURIComponent(params.service)}/${encodeURIComponent(params.id)}`,
		'',
		cookies.get(SESSION),
	),
});

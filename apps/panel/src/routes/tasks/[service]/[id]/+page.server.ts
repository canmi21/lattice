import { SESSION } from '$lib/server/core';
import { tryReadLedger } from '$lib/server/ledger';
import type { TaskDetail } from '$lib/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }) => ({
	service: params.service,
	id: params.id,
	detail: await tryReadLedger<TaskDetail>(
		`/tasks/${encodeURIComponent(params.service)}/${encodeURIComponent(params.id)}`,
		'',
		cookies.get(SESSION),
	),
});

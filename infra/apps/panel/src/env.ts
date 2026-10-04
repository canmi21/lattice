import { defineEnvVars } from '@sveltejs/kit/env';

// Read at run time; one unset reads as the empty string, which every reader treats as unset.
export const variables = defineEnvVars({
	HOST_API: { schema: (input) => input ?? '' },
	HOST_TOKEN: { schema: (input) => input ?? '' },
	// The platform's services the panel shows for now, named by the node rather than imported, so
	// infra knows no platform address; unset hides their pages. See spec/architecture/layers.md.
	CRON_API: { schema: (input) => input ?? '' },
	LEDGER_API: { schema: (input) => input ?? '' },
});

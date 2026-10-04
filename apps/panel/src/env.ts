import { defineEnvVars } from '@sveltejs/kit/env';

// Read at run time; one unset reads as the empty string, which every reader treats as unset.
export const variables = defineEnvVars({
	HOST_API: { schema: (input) => input ?? '' },
	HOST_TOKEN: { schema: (input) => input ?? '' },
});

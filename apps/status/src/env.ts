import { defineEnvVars } from '@sveltejs/kit/env';

// Read at run time; one unset reads as the empty string, which every reader treats as unset.
export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: { public: true, schema: (input) => input ?? '' },
	PUBLIC_SUPABASE_ANON_KEY: { public: true, schema: (input) => input ?? '' },
});

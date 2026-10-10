/// <reference types="@cloudflare/workers-types" />

import type { BuildEnv } from '@canmi/web/build';

declare global {
	/** The build's commit, moment and disclosure; see vite.config.ts. */
	interface ImportMetaEnv extends BuildEnv {}

	namespace Cloudflare {
		interface Env {
			/** The adapter's own: the client files and the prerendered pages. */
			ASSETS: Fetcher;
		}
	}
}

export {};

import type { Disclosure } from '@canmi/web/disclose';

declare global {
	interface ImportMetaEnv {
		/** What the app is made of, defined in vite.config.ts; see lib's spec/web/disclose.md. */
		readonly VITE_DISCLOSURE: Disclosure;
	}
}

export {};

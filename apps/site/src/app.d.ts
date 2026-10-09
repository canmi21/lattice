/// <reference types="@cloudflare/workers-types" />

import type { Theme } from '@canmi/kit/theme';
import type { BuildEnv } from '@canmi/web/build';
import type { Stamped } from '@canmi/web/error';
import type { LocaleCode } from '#lib/locale/index.js';

declare global {
	namespace App {
		/** Which side failed, absent where nothing did; lib's spec/web/error.md. */
		interface Error extends Stamped {
			message: string;
		}
		interface Locals {
			locale?: { code: LocaleCode; language_tag: string };
			/** What the document is painted in, settled from the cookie beside the class. */
			theme?: Theme;
		}
		// interface PageData {}
		// interface PageState {}
	}

	interface ImportMetaEnv extends BuildEnv {
		// URLs are imported from @monoflake/sdk rather than injected, so there is one place to
		// read them from and no second spelling to keep in step. What a build states is
		// `BuildEnv`, lib's spec/web/build.md; what remains here is the app's own.
		/** Another Turnstile test key for development; see lib/trust/trust.svelte.ts. */
		readonly VITE_TURNSTILE_SITE_KEY?: string;
	}

	interface ImportMeta {
		readonly env: ImportMetaEnv;
	}

	interface Window {
		canmiArticleInitialHash?: string;
	}
}

export {};

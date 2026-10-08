/// <reference types="@cloudflare/workers-types" />

import type { Theme } from '@canmi/kit/theme';
import type { BuildEnv } from '@canmi/web/build';
import type { LocaleCode } from '#lib/locale/index.js';

declare global {
	namespace App {
		interface Error {
			message: string;
			/**
			 * Which side failed, and **absent when nothing did**.
			 *
			 * `handleError` stamps only an unexpected error; an `error()` keeps its own body. So
			 * no stamp means an answer rather than a failure -- a 404 is a 404 whichever side
			 * worked it out. One gap: an error surfaced through `__data.json`
			 * arrives as a status and a string and loses this, which draws the page with the
			 * code -- the right fallback, since the status is the part that survived.
			 */
			origin?: 'server' | 'client';
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

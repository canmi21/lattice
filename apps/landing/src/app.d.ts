import type { BuildEnv } from '@canmi/web/build';

declare global {
	interface ImportMetaEnv extends BuildEnv {}
}

export {};

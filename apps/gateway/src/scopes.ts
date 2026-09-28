// Generated from every apps/*/service.toml by `mise run scopes`; do not edit.
import type { Scope } from './table.ts';

export const SCOPES: Readonly<Record<string, Scope>> = {
	geo: {
		placement: 'home',
		binding: 'HOME',
	},
	hook: {
		placement: 'workers',
		binding: 'HOOK',
		worker: 'hook',
	},
	site: {
		placement: 'workers',
		binding: 'SITE',
		worker: 'site',
		prefix: '/api',
	},
};

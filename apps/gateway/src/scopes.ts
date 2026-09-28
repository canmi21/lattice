// Generated from every apps/*/service.toml by `mise run scopes`; do not edit.
import type { Scope } from './table.ts';

export const SCOPES: Readonly<Record<string, Scope>> = {
	geo: {
		placement: 'home',
		binding: 'HOME',
		limits: [
			{
				methods: ['GET', 'HEAD'],
				path: '/address',
				count: 60,
				seconds: 60,
			},
		],
	},
	hook: {
		placement: 'workers',
		binding: 'HOOK',
		worker: 'hook',
	},
	shot: {
		placement: 'home',
		binding: 'HOME',
		limits: [
			{
				methods: ['GET', 'HEAD'],
				path: '/capture',
				count: 3,
				seconds: 60,
			},
		],
	},
	site: {
		placement: 'workers',
		binding: 'SITE',
		worker: 'site',
		prefix: '/api',
	},
};

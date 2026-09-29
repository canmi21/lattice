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
			{
				methods: ['GET', 'HEAD'],
				path: '/ip',
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
	probe: {
		placement: 'home',
		binding: 'HOME',
		limits: [
			{
				methods: ['GET', 'HEAD'],
				path: '/checks',
				count: 60,
				seconds: 60,
			},
			{
				methods: ['GET', 'HEAD'],
				path: '/results',
				count: 30,
				seconds: 60,
			},
		],
	},
	shot: {
		placement: 'home',
		binding: 'HOME',
		limits: [
			{
				methods: ['GET', 'HEAD', 'POST'],
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
	telemetry: {
		placement: 'home',
		binding: 'HOME',
		limits: [
			{
				methods: ['GET', 'HEAD'],
				path: '/machine',
				count: 120,
				seconds: 60,
			},
			{
				methods: ['GET', 'HEAD'],
				path: '/machine/series',
				count: 120,
				seconds: 60,
			},
			{
				methods: ['GET', 'HEAD'],
				path: '/services',
				count: 120,
				seconds: 60,
			},
			{
				methods: ['GET', 'HEAD'],
				path: '/topology',
				count: 120,
				seconds: 60,
			},
			{
				methods: ['GET', 'HEAD'],
				path: '/activity',
				count: 120,
				seconds: 60,
			},
		],
	},
	umami: {
		placement: 'home',
		binding: 'HOME',
		limits: [
			{
				methods: ['POST'],
				path: '/api/send',
				count: 60,
				seconds: 60,
			},
		],
	},
};

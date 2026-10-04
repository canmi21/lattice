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
		routes: [
			{
				path: '/*',
				cors: {
					origins: 'public',
					methods: ['GET', 'HEAD'],
					headers: [],
				},
				cache: {
					fulfilled: 86400,
					accepted: 0,
					redirected: 900,
					rejected: 300,
					faulted: 300,
				},
				crawlable: false,
				exposed: true,
				forbidden: [],
				auth: 'none',
			},
		],
	},
	hook: {
		placement: 'workers',
		binding: 'HOOK',
		worker: 'hook',
		routes: [
			{
				path: '/*',
				cache: {
					fulfilled: 900,
					accepted: 0,
					redirected: 900,
					rejected: 300,
					faulted: 300,
				},
				crawlable: false,
				exposed: true,
				forbidden: [],
				auth: 'none',
			},
		],
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
		routes: [
			{
				path: '/*',
				cache: {
					fulfilled: 60,
					accepted: 0,
					redirected: 900,
					rejected: 300,
					faulted: 300,
				},
				crawlable: false,
				exposed: true,
				forbidden: [],
				auth: 'none',
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
		routes: [
			{
				path: '/status',
				cache: {
					fulfilled: 300,
					accepted: 0,
					redirected: 0,
					rejected: 0,
					faulted: 0,
				},
				crawlable: false,
				exposed: true,
				forbidden: ['internal', 'fresh'],
				auth: 'none',
			},
			{
				path: '/pictures/*',
				cache: {
					fulfilled: 900,
					accepted: 0,
					redirected: 0,
					rejected: 0,
					faulted: 0,
				},
				crawlable: false,
				exposed: true,
				forbidden: ['internal', 'fresh'],
				auth: 'none',
			},
			{
				path: '/*',
				cache: {
					fulfilled: 0,
					accepted: 0,
					redirected: 0,
					rejected: 0,
					faulted: 0,
				},
				crawlable: false,
				exposed: true,
				forbidden: ['internal', 'fresh'],
				auth: 'none',
			},
		],
	},
	site: {
		placement: 'workers',
		binding: 'SITE',
		worker: 'site',
		prefix: '/api',
		routes: [
			{
				path: '/*',
				cache: {
					fulfilled: 900,
					accepted: 0,
					redirected: 900,
					rejected: 300,
					faulted: 300,
				},
				crawlable: false,
				exposed: true,
				forbidden: [],
				auth: 'none',
			},
		],
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
		routes: [
			{
				path: '/services',
				cache: {
					fulfilled: 5,
					accepted: 0,
					redirected: 900,
					rejected: 300,
					faulted: 300,
				},
				crawlable: false,
				exposed: true,
				forbidden: [],
				auth: 'none',
			},
			{
				path: '/machine',
				cache: {
					fulfilled: 5,
					accepted: 0,
					redirected: 900,
					rejected: 300,
					faulted: 300,
				},
				crawlable: false,
				exposed: true,
				forbidden: [],
				auth: 'none',
			},
			{
				path: '/*',
				cache: {
					fulfilled: 60,
					accepted: 0,
					redirected: 900,
					rejected: 300,
					faulted: 300,
				},
				crawlable: false,
				exposed: true,
				forbidden: [],
				auth: 'none',
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
		routes: [
			{
				path: '/api/send',
				cors: {
					origins: ['status'],
					methods: ['POST'],
					headers: ['x-umami-website-id', 'x-umami-hostname', 'x-umami-cache'],
				},
				cache: {
					fulfilled: 900,
					accepted: 0,
					redirected: 900,
					rejected: 300,
					faulted: 300,
				},
				crawlable: false,
				exposed: true,
				forbidden: [],
				auth: 'none',
			},
			{
				path: '/*',
				cache: {
					fulfilled: 900,
					accepted: 0,
					redirected: 900,
					rejected: 300,
					faulted: 300,
				},
				crawlable: false,
				exposed: false,
				forbidden: [],
				auth: 'none',
			},
		],
	},
};

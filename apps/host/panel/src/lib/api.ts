/**
 * host's API as the panel reads it, under `/api/`: same origin, the session cookie carried by the
 * browser, and every answer in the envelope. See spec/architecture/host.md, "The panel is host's
 * own".
 */
import type { ApiResponse } from '@canmi/response';

export interface Version {
	manifest: { name: string; container?: { port?: number; socket?: string; memory_mb?: number } };
	image: string;
}

/** An app as host shows it. */
export interface App extends Version {
	previous: Version | null;
	deployed_at: string;
	held: boolean;
	running: boolean;
	restorable: boolean;
}

export type Action =
	| 'deploy'
	| 'redeploy'
	| 'rollback'
	| 'rollback_with_data'
	| 'start'
	| 'stop'
	| 'restart';

export interface Event {
	id: number;
	app: string;
	action: Action;
	source: { kind: 'run' | 'upload' | 'panel'; run?: number; commit?: string };
	image?: string;
	snapshot?: string;
	outcome: 'running' | 'succeeded' | 'failed' | 'skipped';
	detail?: string;
	started_at: string;
	finished_at?: string;
}

export interface Route {
	name: string;
	upstream: string;
	private: boolean;
	public: boolean;
	home?: string;
}

export interface Environment {
	config: Record<string, string>;
	secrets: string[];
}

export interface Archived {
	file: string;
	bytes: number;
}

/** Not signed in, or signed out since: the panel asks for the token again. */
export class SignedOut extends Error {}

/** A refusal, as host words it. */
export class Refused extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

export async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
	const response = await fetch(path, {
		method,
		headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (response.status === 401) throw new SignedOut();
	// A change with nothing to say: stored, and Caddy in step.
	if (response.status === 204) return null as T;
	const envelope = (await response.json()) as ApiResponse<T>;
	if (envelope.status === 'error') throw new Refused(envelope.code, envelope.message);
	return envelope.data;
}

export const api = {
	signIn: (token: string) => call<null>('POST', '/api/session', { token }),
	signOut: () => call<null>('DELETE', '/api/session'),
	apps: () => call<App[]>('GET', '/api/apps'),
	app: (name: string) => call<App>('GET', `/api/apps/${name}`),
	history: (name: string, before?: number) =>
		call<Event[]>('GET', `/api/apps/${name}/history${before ? `?before=${before}` : ''}`),
	lines: (name: string) => call<{ lines: string[] }>('GET', `/api/apps/${name}/logs`),
	archived: (name: string) => call<Archived[]>('GET', `/api/apps/${name}/logs/archive`),
	environment: (name: string) => call<Environment>('GET', `/api/apps/${name}/environment`),
	setVariable: (name: string, kind: 'config' | 'secret', key: string, value: string) =>
		call<{ changed: boolean }>('PUT', `/api/apps/${name}/environment/${kind}/${key}`, { value }),
	unsetVariable: (name: string, kind: 'config' | 'secret', key: string) =>
		call<{ changed: boolean }>('DELETE', `/api/apps/${name}/environment/${kind}/${key}`),
	redeploy: (name: string) => call<unknown>('POST', `/api/apps/${name}/redeploy`),
	rollback: (name: string, withData: boolean) =>
		call<unknown>('POST', `/api/apps/${name}/rollback`, { with_data: withData }),
	act: (name: string, act: 'start' | 'stop' | 'restart') =>
		call<unknown>('POST', `/api/apps/${name}/${act}`),
	routes: () => call<Route[]>('GET', '/api/routes'),
	putRoute: (route: Route) => call<null>('PUT', `/api/routes/${route.name}`, route),
	deleteRoute: (name: string) => call<null>('DELETE', `/api/routes/${name}`),
};

/** An image id as a person reads it. */
export function short(image: string | undefined): string {
	return image ? image.replace(/^sha256:/, '').slice(0, 12) : '';
}

/** A moment as a person reads it, in their own zone. */
export function when(stamp: string | undefined): string {
	return stamp ? new Date(stamp).toLocaleString() : '';
}

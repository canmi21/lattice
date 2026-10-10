/**
 * Every read of the backend a request makes, whole and typed, each asked at most once however
 * many facets take it: the facets cut what a component draws from these, and nothing reads the
 * backend around them. See spec/architecture/console.md, "A component asks for its facet".
 */
import { runsIn } from '../scope/runs.ts';
import type { View } from '../scope/scope.ts';
import type { Cluster, History } from '../wire.ts';
import { type Edge, type Read, cluster, history } from './read.ts';
import type { Runs } from './runs.ts';

export class Sources {
	readonly #held = new Map<string, Promise<unknown>>();

	constructor(readonly edge: Edge) {}

	#once<T>(key: string, read: () => Promise<T>): Promise<T> {
		const held = this.#held.get(key);
		if (held) return held as Promise<T>;
		const asked = read();
		this.#held.set(key, asked);
		return asked;
	}

	/** Every node as the nearest relay that answers holds them. */
	cluster(): Promise<Read<Cluster>> {
		return this.#once('cluster', () => cluster(this.edge));
	}

	/** Every node's history over `span` seconds in slots of `slot` seconds. */
	history(span: number, slot: number): Promise<Read<History>> {
		return this.#once(`history ${span} ${slot}`, () => history(this.edge, span, slot));
	}

	/** The runs of `view`, the mirror's 30 days. */
	runs(view: View): Promise<Runs> {
		return this.#once(`runs ${view}`, () => runsIn(this.edge, view));
	}
}

/** One `Sources` a request, kept by the request itself, so a load and its hook share one. */
const BY_REQUEST = new WeakMap<Request, Sources>();

export function sourcesOf(request: Request, edge: Edge): Sources {
	const held = BY_REQUEST.get(request);
	if (held) return held;
	const made = new Sources(edge);
	BY_REQUEST.set(request, made);
	return made;
}

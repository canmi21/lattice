/**
 * A facet asked from the browser: at its name in development, at the contract address the build
 * stated in production, each answer typed by the facet the server cuts. See
 * spec/architecture/console.md, "A component asks for its facet".
 */
import { asking, pathOf } from '@canmi/addresses';
import type { AnswerOf, FacetName, ParamsOf } from './server/facets.ts';

/** Stated by a production build; see vite.config.ts. Absent in development and in tests. */
declare const STATED_FACET_ADDRESSES: Readonly<Record<FacetName, string>> | undefined;

/** Every facet's name, which is its shape: what a facet takes it takes in the query. */
export const NAMES = [
	'history',
	'steps',
	'now',
	'nodes',
	'timeline',
] as const satisfies readonly FacetName[];

/** Where facets are asked, on the console's own origin. */
export const PREFIX = '/api/';

export const ASKED = asking<FacetName>(
	Object.fromEntries(NAMES.map((name) => [name, name])) as Record<FacetName, string>,
	typeof STATED_FACET_ADDRESSES === 'object' ? STATED_FACET_ADDRESSES : undefined,
);

/**
 * `name`'s answer for `params`; undefined where it could not be read, which the caller draws as
 * not yet known. `priority` is the fetch's: low for what is read ahead of being wanted.
 */
export async function ask<N extends FacetName>(
	name: N,
	params: ParamsOf<N>,
	priority: RequestPriority = 'auto',
): Promise<AnswerOf<N> | undefined> {
	try {
		const answer = await fetch(pathOf(ASKED, PREFIX, name, params), { priority });
		if (!answer.ok) return undefined;
		const body = (await answer.json()) as { status: string; data?: AnswerOf<N> };
		return body.status === 'success' ? body.data : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Which node the platform's database is primary on, as the `primary` proxy routing to it says --
 * one host read, of the nearest node that answers, since the proxy runs on every node and each
 * routes to the same one. Nothing where none or more than one is up, or no node answers. See
 * spec/console/overview.md, "A place's card says what the list does not".
 */
import { order } from './nodes.ts';
import { kept } from './cache.ts';
import type { Edge } from './read.ts';
import { appHealth } from './reads.ts';

/** The proxy's `routing`, as platform's apps/data/primary/src/check.rs tags it. */
interface Routing {
	target?: 'one' | 'none' | 'many';
	member?: string;
}

/** The proxy's own answer, whether host passed it on in its envelope or bare. */
type Answered = { data?: { routing?: Routing }; routing?: Routing } | undefined;

export async function primaryOf(edge: Edge): Promise<string | undefined> {
	// Half a minute: the primary moves seldom, and asking walks the nodes one by one.
	return kept(
		edge,
		'primary',
		30,
		() => asked(edge),
		(one) => one !== undefined,
	);
}

async function asked(edge: Edge): Promise<string | undefined> {
	for (const name of order(edge.where)) {
		// oxlint-disable-next-line no-await-in-loop -- the first that answers is the answer
		const read = await appHealth(edge, name, 'primary');
		if (!read.ok || !read.data.answered) continue;
		const body = read.data.body as Answered;
		const routing = body?.data?.routing ?? body?.routing;
		return routing?.target === 'one' ? routing.member : undefined;
	}
	return undefined;
}

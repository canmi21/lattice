/**
 * How an app is rolled out, as its `service.toml` names it and host passes it on: infra's
 * spec/architecture/host.md, "An app chooses how it is rolled out, and keeping nothing earns a
 * gapless one". The word is host's to add to, so one the console does not know is written as is.
 */
import type { Node } from '../server/nodes.ts';
import type { Read } from '../server/read.ts';

/** Written where a reader looks; the code word goes on hover. */
const LABELS: Readonly<Record<string, string>> = {
	replace: 'Restart',
	beside: 'Zero downtime',
	manual: 'By hand',
};

/** What an app that names none is rolled out by, written fainter than the rest in a table. */
export const DEFAULT_ROLLOUT = 'replace';

/** An app's rollout, at its top level or in its manifest; none, or not a word, is the default. */
export function rolloutOf(app: { rollout?: unknown; manifest?: { rollout?: unknown } }): string {
	const named = app.rollout ?? app.manifest?.rollout;
	return typeof named === 'string' && named !== '' ? named : DEFAULT_ROLLOUT;
}

export const rolloutLabel = (rollout: string): string => LABELS[rollout] ?? rollout;

type Shown = Parameters<typeof rolloutOf>[0];

/**
 * Each rollout the nodes that answered show an app by, with the nodes that show it, in node
 * order: one, unless a deploy has reached some nodes and not the rest.
 */
export function rolloutsOf(
	reads: Partial<Record<Node, Read<Shown>>> | undefined,
): { rollout: string; nodes: Node[] }[] {
	const found = new Map<string, Node[]>();
	for (const [node, read] of Object.entries(reads ?? {}) as [Node, Read<Shown> | undefined][]) {
		if (!read?.ok) continue;
		const rollout = rolloutOf(read.data);
		found.set(rollout, [...(found.get(rollout) ?? []), node]);
	}
	return [...found].map(([rollout, nodes]) => ({ rollout, nodes }));
}

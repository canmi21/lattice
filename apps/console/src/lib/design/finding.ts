/**
 * What `Find` finds within the view being read, and in which order: the view's pages, the nodes
 * where the view shows them, and the apps the view holds, each by the name the console writes it
 * with and found by that name or its code. See spec/console/design.md, "The sidebar's head is the
 * way in to finding".
 */
import { countryOf, nameOf, partOf } from '../map/places.ts';
import { CODES } from '../nodes/facts.ts';
import { type View, appHref, displayOf, nodeHref, shows, within } from '../scope/scope.ts';
import { sectionsIn } from '../sections.ts';
import type { Entry } from '../wire.ts';

export type Kind = 'page' | 'node' | 'app';

export interface Found {
	key: string;
	kind: Kind;
	/** The name it is shown by. */
	label: string;
	/** Its code, where the name is not it: found by, and never shown. */
	code?: string;
	/** Another name it is found by and not shown: a node's place in full, `Tokyo, Japan`. */
	also?: string;
	href: string;
}

/** Everything `view` lets one find, in the order an empty field lists it. */
export function findable(view: View, nodes: Readonly<Record<string, Entry>>): Found[] {
	const pages = sectionsIn(view).map((section): Found => ({
		key: `page ${section.path}`,
		kind: 'page',
		label: section.label,
		href: within(view, section.path),
	}));
	const places =
		view === 'all' || view === 'infra'
			? CODES.map((code): Found => ({
					key: `node ${code}`,
					kind: 'node',
					// By the part of its place that tells it from the others there, as the card heads it.
					label: `${partOf(code)}, ${countryOf(code)}`,
					code,
					also: nameOf(code).full,
					href: nodeHref(view, code),
				}))
			: [];
	const names = new Set(
		Object.values(nodes).flatMap((entry) => (entry.snapshot?.apps ?? []).map((app) => app.name)),
	);
	const apps = [...names]
		.filter((name) => shows(view, name))
		.map((name): Found => ({
			key: `app ${name}`,
			kind: 'app',
			label: displayOf(name),
			code: name,
			href: appHref(view, name),
		}))
		.toSorted((a, b) => a.label.localeCompare(b.label));
	return [...pages, ...places, ...apps];
}

/**
 * Those of `all` that `query` finds, the best first: a name that starts with it, then a word in
 * the name that does, then a code that does, then anything holding it; ties keep their order. An
 * empty query finds everything as it stands.
 */
export function find(all: readonly Found[], query: string): Found[] {
	const wanted = query.trim().toLowerCase();
	if (!wanted) return [...all];
	const rank = (one: Found): number => {
		const label = one.label.toLowerCase();
		const code = one.code?.toLowerCase();
		const also = one.also?.toLowerCase();
		if (label.startsWith(wanted)) return 0;
		if (label.split(/[\s,]+/).some((word) => word.startsWith(wanted))) return 1;
		if (code?.startsWith(wanted) || also?.startsWith(wanted)) return 2;
		if (label.includes(wanted) || code?.includes(wanted) || also?.includes(wanted)) return 3;
		return 4;
	};
	return all
		.map((one, at) => ({ one, at, rank: rank(one) }))
		.filter(({ rank }) => rank < 4)
		.toSorted((a, b) => a.rank - b.rank || a.at - b.at)
		.map(({ one }) => one);
}

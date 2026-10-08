/**
 * The console's five sections, in the sidebar's order: where each lives inside a view, what it is
 * called, and the one scope it belongs to, if any, shown besides under All. See
 * spec/architecture/console.md.
 */
import LayoutDashboardIcon from '@tabler/icons-svelte-runes/icons/layout-dashboard';
import LogsIcon from '@tabler/icons-svelte-runes/icons/logs';
import PackagesIcon from '@tabler/icons-svelte-runes/icons/packages';
import RocketIcon from '@tabler/icons-svelte-runes/icons/rocket';
import ServerIcon from '@tabler/icons-svelte-runes/icons/server-2';
import { type View, isScope, within } from './scope/scope.ts';

export const SECTIONS = [
	{ path: '/', label: 'Overview', icon: LayoutDashboardIcon },
	{ path: '/nodes', label: 'Nodes', icon: ServerIcon, only: 'infra' },
	{ path: '/deployments', label: 'Deployments', icon: RocketIcon },
	{ path: '/apps', label: 'Apps', icon: PackagesIcon },
	{ path: '/events', label: 'Events', icon: LogsIcon },
] as const;

export type Section = (typeof SECTIONS)[number];

const has = (view: View, section: Section) =>
	view === 'all' || !('only' in section) || section.only === view;

/** The sections `view` shows. */
export const sectionsIn = (view: View): Section[] =>
	SECTIONS.filter((section) => has(view, section));

/** The section `path` is in, past a scope's segment; the Overview only at the view's root. */
export function sectionOf(path: string): Section | undefined {
	const first = /^\/([^/]+)/.exec(path)?.[1];
	const rest = (first && isScope(first) ? path.slice(first.length + 1) : path) || '/';
	return SECTIONS.find((section) =>
		section.path === '/'
			? rest === '/'
			: rest === section.path || rest.startsWith(`${section.path}/`),
	);
}

/** Where `section` is in `view`, or that view's overview where it has no such section. */
export const hrefIn = (view: View, section: Section | undefined): string =>
	within(view, section && has(view, section) ? section.path : '/');

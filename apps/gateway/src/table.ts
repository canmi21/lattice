import { parse } from 'smol-toml';

/** One scope the public API host answers, as the gateway routes it. */
export interface Scope {
	/** `workers`, or the node whose Caddy answers it. See spec/architecture/services.md. */
	readonly placement: string;
	/** The binding the request goes out through: the Worker's, or the node's VPC service. */
	readonly binding: string;
	/** The Worker behind the binding, on a Workers placement; wrangler.jsonc binds it by name. */
	readonly worker?: string;
}

/** The placement that is Cloudflare's Workers; the same string as `WORKERS` in manifest.rs. */
export const WORKERS = 'workers';

/** A binding's name: the scope's or the node's, uppercased, hyphens as underscores. */
export function bindingOf(name: string): string {
	return name.toUpperCase().replaceAll('-', '_');
}

interface Declaration {
	name: string;
	placements: string[];
	api?: { public?: boolean; worker?: string };
}

/**
 * The public scopes among `declarations`, each routed to its first placement. A scope that is not
 * public is left out: the public host does not know it exists. Failing over to a later placement
 * is not built yet; see spec/architecture/services.md, "Cloudflare is the one entrance".
 */
export function scopeTable(declarations: readonly string[]): Record<string, Scope> {
	const table: Record<string, Scope> = {};
	const read = declarations.map((text) => parse(text) as unknown as Declaration);
	for (const declaration of read.toSorted((a, b) => a.name.localeCompare(b.name))) {
		const [placement] = declaration.placements;
		if (!declaration.api?.public || placement === undefined) continue;
		table[declaration.name] =
			placement === WORKERS
				? {
						placement,
						binding: bindingOf(declaration.name),
						worker: declaration.api.worker ?? declaration.name,
					}
				: { placement, binding: bindingOf(placement) };
	}
	return table;
}

/** The table as the committed module `src/scopes.ts`, which the Worker imports. */
export function renderScopes(table: Record<string, Scope>): string {
	return [
		'// Generated from every apps/*/service.toml by `mise run scopes`; do not edit.',
		"import type { Scope } from './table.ts';",
		'',
		`export const SCOPES: Readonly<Record<string, Scope>> = ${JSON.stringify(table, null, '\t')};`,
		'',
	].join('\n');
}

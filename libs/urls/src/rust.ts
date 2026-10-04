import { GATEWAY_HOSTS, GATEWAY_NAMES, URLS } from './index.ts';

/**
 * The Rust mirror of the URL map.
 *
 * Rust cannot import this library, so every Rust program reads a generated `libs/urls/src/lib.rs`
 * instead, the `urls` crate -- committed like the records under `data/build/`, because a checkout
 * must compile without a Node toolchain having run first. `mise run urls` rewrites it;
 * `rust.test.ts` fails when the committed file no longer matches this render, so drift between
 * the two languages cannot survive `mise run verify`. See spec/architecture/workspace.md.
 */
export function rustUrlMap(): string {
	const pairs: Array<[name: string, value: string]> = [];
	walk(URLS, [], pairs);
	const constants = pairs
		.map(([name, value]) => `pub const ${name}: &str = "${value}";`)
		.join('\n');
	const quoted = (list: readonly string[]) => list.map((item) => `"${item}"`).join(', ');
	const hosts = quoted(GATEWAY_HOSTS);
	const { exact, deployments } = GATEWAY_NAMES;
	return [
		'//! Generated from libs/urls/src/index.ts by `mise run urls`; do not edit.',
		'//! One URL map for both languages -- see spec/architecture/workspace.md.',
		'',
		constants,
		'',
		'/// Every hostname the gateway answers at home.',
		'#[rustfmt::skip]',
		`pub const GATEWAY_HOSTS: [&str; ${GATEWAY_HOSTS.length}] = [${hosts}];`,
		'/// The names the gateway answers at home exactly, and the zone its deployments are read under.',
		'#[rustfmt::skip]',
		`pub const GATEWAY_EXACT: [&str; ${exact.length}] = [${quoted(exact)}];`,
		`pub const GATEWAY_DEPLOYMENTS: &str = "${deployments.zone}";`,
		'#[rustfmt::skip]',
		`pub const GATEWAY_REGIONS: [&str; ${deployments.regions.length}] = [${quoted(deployments.regions)}];`,
		'#[rustfmt::skip]',
		`pub const GATEWAY_PROVIDERS: [&str; ${deployments.providers.length}] = [${quoted(deployments.providers)}];`,
		'',
	].join('\n');
}

function walk(value: unknown, path: string[], out: Array<[string, string]>): void {
	if (typeof value === 'string') {
		const name = path
			.map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase())
			.join('_');
		out.push([name, value]);
		return;
	}
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		walk(child, [...path, key], out);
	}
}

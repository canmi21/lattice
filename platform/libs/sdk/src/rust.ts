import { rustConstants } from '@canmi/me/rust';
import { GATEWAY_HOSTS, GATEWAY_NAMES, URLS } from './index.ts';

/**
 * The Rust mirror of the URL map.
 *
 * Rust cannot import this library, so every Rust program reads the generated `src/lib.rs`, the
 * `monoflake` crate, committed so a checkout compiles without Node having run. `mise run urls`
 * rewrites it and `rust.test.ts` fails when it no longer matches this render, so the two languages
 * cannot drift past `mise run verify`. See spec/architecture/workspace.md.
 */
export function rustUrlMap(): string {
	const constants = rustConstants(URLS);
	const quoted = (list: readonly string[]) => list.map((item) => `"${item}"`).join(', ');
	const hosts = quoted(GATEWAY_HOSTS);
	const { exact, deployments } = GATEWAY_NAMES;
	return [
		'//! @generated from platform/libs/sdk/src/index.ts by `mise run urls`; do not edit.',
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

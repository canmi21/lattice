import { disclose } from '@canmi/web/disclose';

/**
 * A patch for Wappalyzer, whose D3 fingerprint reads `d3.version`; d3-hierarchy sets no global.
 *
 * The value names the module, not D3, so Wappalyzer shows D3 without a version rather than
 * reading d3-hierarchy's 3.x as D3's. An app that does not define the version skips it. See
 * lib's spec/web/disclose.md.
 */
export function discloseD3(): void {
	const version = import.meta.env.VITE_D3_HIERARCHY_VERSION;
	if (version) disclose({ 'd3.version': `d3-hierarchy@${version}` });
}

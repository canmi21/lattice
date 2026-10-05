import { disclose } from '@canmi/web/disclose';

/** What the app's build disclosed, absent in an app whose build does not. */
const versions = import.meta.env.VITE_DISCLOSURE?.versions ?? {};

/**
 * Patches for Wappalyzer, set by the blocks that use each library, so only their pages say so.
 * See lib's spec/web/disclose.md.
 */

/**
 * D3 is read from `d3.version`, which d3-hierarchy never sets. The value names the module, which
 * Wappalyzer's version check refuses, so D3 shows without d3-hierarchy's 3.x read as its own.
 */
export function discloseD3(): void {
	const version = versions['d3-hierarchy'];
	if (version) disclose({ 'd3.version': `d3-hierarchy@${version}` });
}

/** Video.js is read from `videojs.VERSION`, which its headless core never sets. */
export function discloseVideoJs(): void {
	disclose({ 'videojs.VERSION': versions['@videojs/core'] });
}

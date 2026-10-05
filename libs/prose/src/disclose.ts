import { disclose, discloseD3 as discloseD3Module } from '@canmi/web/disclose';

/** What the app's build disclosed, absent in an app whose build does not. */
const disclosure = import.meta.env.VITE_DISCLOSURE;

/**
 * Patches for Wappalyzer, set by the blocks that use each library, so only their pages say so.
 * See lib's spec/web/disclose.md.
 */

/** D3, by the module the blocks draw with; see `discloseD3` in `@canmi/web/disclose`. */
export function discloseD3(): void {
	discloseD3Module(disclosure);
}

/** Video.js is read from `videojs.VERSION`, which its headless core never sets. */
export function discloseVideoJs(): void {
	disclose({ 'videojs.VERSION': disclosure?.versions['@videojs/core'] });
}

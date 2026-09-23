// Modules Vite invents, which no package ships types for. The plugin behind each block is in
// apps/site/vite.config.ts unless the block says otherwise.

declare module 'virtual:redirects' {
	// Merged 301 map (built-in + site.config.yaml), baked at build and consumed by the
	// [...path] route's universal load, so it reaches the browser as well as the Worker.
	export const redirects: Record<string, string>;
}

declare module 'virtual:licenses' {
	import type { LicenseRecord } from '$lib/licenses/record';

	/**
	 * Every dependency the deployables ship, keyed by purl. Written by `local licenses` into
	 * data/build/licenses.json and embedded here by Vite; the licence texts it points at are
	 * published objects rather than part of this.
	 */
	export const licenses: LicenseRecord;
}

declare module 'virtual:site' {
	export const site: {
		name: string;
		tagline: string;
		author: {
			name: string;
			fullName: string;
			role: string;
			email: string;
			telegram: string;
			twitter?: string;
			github: string;
			githubId: number;
			fediverse: string;
			bluesky: string;
		};
		// The boxes the site answers on, name to purpose. The address is the name at `domain`,
		// composed where it is used, so no address is written out.
		mail: { domain: string; boxes: { support: string } };
		feed: { id: string; followDescription: string };
		indexnow: string;
		// Both public by construction: they ship in the browser bundle. See spec/search.md.
		algolia: { appId: string; searchKey: string; index: string };
	};
}

// Supplied by @stylexjs/unplugin/vite, not by a plugin of ours.
declare module 'virtual:stylex:runtime' {
	// Development only. Importing it subscribes the page to StyleX's own hot updates; the
	// plugin serves the stylesheet at /virtual:stylex.css rather than emitting an asset, so
	// nothing is exported and nothing is read. See spec/architecture/css/layers.md.
}

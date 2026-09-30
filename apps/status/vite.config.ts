import { fileURLToPath } from 'node:url';
import { pluginOptions, sourcemapSetting, uploadsSourceMaps } from '@canmi/sentry/build';
import { URLS } from '@canmi/urls';
import { sentrySvelteKit } from '@sentry/sveltekit';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The workspace root, as the site and the panel set it: StyleX hashes a class from the file's path
// relative to this, and reads `libs/tokens` from under it.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Where each door's adapter writes the maps; see svelte.config.js for the doors.
const MAPS = {
	vercel: ['.svelte-kit/output/**/*.map', '.vercel/output/**/*.map'],
	cloudflare: ['.svelte-kit/cloudflare/**/*.map'],
};

// No DSN, no plugin: the build then carries nothing of Sentry's. Vercel's build may hold no
// token, so a missing one skips the upload rather than failing.
const sentry = Boolean(URLS.external.sentry.status);
const upload = sentry && uploadsSourceMaps(process.env);
const maps = process.env.STATUS_TARGET === 'cloudflare' ? MAPS.cloudflare : MAPS.vercel;

export default defineConfig({
	plugins: [
		tailwindcss(),
		...(sentry
			? [
					sentrySvelteKit(
						pluginOptions({ project: 'status', upload, env: process.env, mapsToDelete: maps }),
					),
				]
			: []),
		sveltekit(),
		{
			// This app's own StyleX build, after the Svelte compiler rather than before it; see
			// spec/architecture/css/layers.md, "The build order is the opposite of what StyleX
			// documents", and "Every app compiles its own StyleX".
			...stylex({
				useCSSLayers: true,
				aliases: { '$lib/*': ['/ROOT/apps/status/src/lib/*'] },
				unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
				lightningcssOptions: { minify: true },
			}),
			enforce: undefined,
		},
	],
	// Hashed file names in hex, as the site's are.
	build: {
		sourcemap: sourcemapSetting(upload),
		rollupOptions: { output: { hashCharacters: 'hex' } },
	},
});

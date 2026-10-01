import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { esbuildTarget } from '@canmi/compat/build';
import { pluginOptions, sourcemapSetting, uploadsSourceMaps } from '@canmi/sentry/build';
import { PORT_OFFSET, URLS } from '@canmi/urls';
import { sentrySvelteKit } from '@sentry/sveltekit';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The workspace root, as the site and the panel set it: StyleX hashes a class from the file's path
// relative to this, and reads `libs/tokens` from under it.
// `browserslist` in package.json is the syntax floor, the site's exactly; see spec/compat.md.
const BROWSERSLIST: string[] = JSON.parse(
	readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).browserslist;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// The Supabase pair by either name, the bare one first: mise decrypts it bare, Vercel sets it
// `PUBLIC_`, and only a `PUBLIC_` name reaches the browser. See spec/architecture/probe.md.
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
	const bare = process.env[name];
	if (bare) process.env[`PUBLIC_${name}`] = bare;
}

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
	// Pinned, shifted in the sandbox. See spec/toolchain.md, "Dev ports are pinned".
	server: { host: '::', port: 26522 + PORT_OFFSET, strictPort: true },
	// Hashed file names in hex, as the site's are.
	build: {
		target: esbuildTarget(BROWSERSLIST),
		sourcemap: sourcemapSetting(upload),
		rollupOptions: { output: { hashCharacters: 'hex' } },
	},
});

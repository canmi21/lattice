import vercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { esbuildTarget } from '@canmi/web/compat/build';
import { pluginOptions, sourcemapSetting, uploadsSourceMaps } from '@canmi/web/sentry/build';
import { URLS } from '@monoflake/sdk';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The workspace root, as the site and the panel set it: StyleX hashes a class from the file's path
// relative to this.
// `browserslist` in package.json is the syntax floor, the site's exactly; see spec/compat.md.
const BROWSERSLIST: string[] = JSON.parse(
	readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).browserslist;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// The Supabase pair by either name, the bare one first: mise decrypts it bare, Vercel sets it
// `PUBLIC_`, and only a `PUBLIC_` name reaches the browser. See spec/architecture/status.md, "The
// page: one app, served by Vercel".
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
	const bare = process.env[name];
	if (bare) process.env[`PUBLIC_${name}`] = bare;
}

// Where the build writes the maps that Sentry takes and the deployment must not carry.
const MAPS = ['.svelte-kit/output/**/*.map', '.vercel/output/**/*.map'];

// No DSN, no plugin: the build then carries nothing of Sentry's. Vercel's build may hold no
// token, so a missing one skips the upload rather than failing.
const sentry = Boolean(URLS.external.sentry.status);
const upload = sentry && uploadsSourceMaps(process.env);

/**
 * Vercel's adapter alone: the page is served from outside the platform it reports on. The runtime
 * is stated, since the adapter otherwise takes the building Node's, and mise's is newer than Vercel
 * runs. See spec/architecture/status.md, "The page: one app, served by Vercel".
 */
const adapter = vercel({ runtime: 'nodejs24.x' });

export default defineConfig({
	plugins: [
		tailwindcss(),
		...(sentry
			? [
					sentrySvelteKit(
						pluginOptions({ project: 'status', upload, env: process.env, mapsToDelete: MAPS }),
					),
				]
			: []),

		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: { runes: true },
			adapter,
			// `#lib` for svelte-check, as the site's config says.
			alias: { '#lib': 'src/lib' },
		}),

		{
			// This app's own StyleX build, after the Svelte compiler rather than before it; see
			// spec/architecture/css/layers.md, "The build order is the opposite of what StyleX
			// documents", and "Every app compiles its own StyleX".
			...stylex({
				useCSSLayers: true,
				aliases: { '#lib/*': ['/ROOT/apps/status/src/lib/*'] },
				unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
				lightningcssOptions: { minify: true },
			}),
			enforce: undefined,
		},
	],
	// Pinned. See spec/toolchain.md, "Dev ports are pinned".
	server: { host: '::', port: 26522, strictPort: true },
	// Hashed file names in hex, as the site's are.
	build: {
		target: esbuildTarget(BROWSERSLIST),
		sourcemap: sourcemapSetting(upload),
		rollupOptions: { output: { hashCharacters: 'hex' } },
	},
});

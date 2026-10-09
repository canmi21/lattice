import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { buildDefine } from '@canmi/web/build';
import { pluginOptions, sourcemapSetting, uploadsSourceMaps } from '@canmi/web/sentry/build';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';

// The repository root, as the site and the status page set it: StyleX hashes a class from the
// file's path relative to this.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Sentry's plugin hands its browser half the `$app/state` tracing SvelteKit 3 needs; without it
// the SDK reaches for the removed `$app/stores` and the page never hydrates. Maps upload only with
// a token, which the console's build does not hold yet. See spec/architecture/console.md, "Errors
// go to Sentry, and development sends nothing".
const upload = uploadsSourceMaps(process.env);
const stylexPlugin = stylex({
	useCSSLayers: true,
	unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
	lightningcssOptions: { minify: true },
});

export default defineConfig({
	// The commit, the build moment and the disclosure; see lib's spec/web/build.md.
	define: buildDefine(fileURLToPath(new URL('.', import.meta.url))),
	plugins: [
		tailwindcss(),
		sentrySvelteKit(
			pluginOptions({
				project: 'console',
				upload,
				env: process.env,
				mapsToDelete: ['.svelte-kit/output/**/*.map'],
			}),
		),
		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: { runes: true },
			// Every page rendered in the Worker, from what the nodes answer through their bindings.
			adapter: adapter(),
		}),

		{
			// After the Svelte compiler, not before it; see spec/architecture/css/layers.md, "The build
			// order is the opposite of what StyleX documents".
			...stylexPlugin,
			enforce: undefined,
			// SvelteKit owns the HTML shell; +layout.svelte injects these two dev assets itself.
			transformIndexHtml: undefined,
		},

		{
			// `/live` while serving, which Vite's own upgrade handling never passes to the hook; see
			// scripts/live.ts. A build never loads it.
			name: 'console-live',
			apply: 'serve',
			async configureServer(server) {
				const { live } = await import('./scripts/live.ts');
				live(server);
			},
		},
	],
	build: {
		target: 'es2023',
		sourcemap: sourcemapSetting(upload),
		rollupOptions: { output: { hashCharacters: 'hex' } },
	},
});

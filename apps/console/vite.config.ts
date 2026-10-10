import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { pickUrls } from '@monoflake/sdk';
import { buildDefine } from '@canmi/web/build';
import { pluginOptions, sourcemapSetting, uploadsSourceMaps } from '@canmi/web/sentry/build';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import { facetAddresses } from './scripts/facets.ts';

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

export default defineConfig(({ mode }) => ({
	define: {
		// The commit, the build moment and the disclosure; see lib's spec/web/build.md.
		...buildDefine(fileURLToPath(new URL('.', import.meta.url))),
		// The facets' addresses, stated to the pages and the Worker by one build, so the two agree;
		// see spec/architecture/console.md, "A component asks for its facet".
		...(mode === 'production' ? { STATED_FACET_ADDRESSES: JSON.stringify(facetAddresses()) } : {}),
	},
	// Its own pinned port, refused rather than moved when taken, so one console runs at a time; see
	// spec/toolchain.md, "Dev ports are pinned".
	server: { port: 26527, strictPort: true },
	plugins: [
		{
			// The font stylesheets in @canmi/fonts name their host by a placeholder, which mode
			// decides: the CDN, or the local gateway in development, as the avatar's is read.
			name: 'replace-cdn-url',
			transform(code: string, id: string) {
				if (!/\.css($|\?)/.test(id) || !code.includes('__CDN_URL__')) return null;
				return code.replaceAll('__CDN_URL__', pickUrls(mode !== 'production').cdn);
			},
		},
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
}));

import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The repository root, as the site and the status page set it: StyleX hashes a class from the
// file's path relative to this.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const stylexPlugin = stylex({
	useCSSLayers: true,
	unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
	lightningcssOptions: { minify: true },
});

export default defineConfig({
	plugins: [
		tailwindcss(),
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
	build: { target: 'es2023', rollupOptions: { output: { hashCharacters: 'hex' } } },
});

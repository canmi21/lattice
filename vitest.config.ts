import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

const SITE = fileURLToPath(new URL('./apps/site/', import.meta.url));

/**
 * The one thing the default configuration cannot resolve.
 *
 * `apps/cdn` imports its codecs' `.wasm` files directly, which wrangler substitutes at bundle
 * time and node does not -- so any test reaching one failed to load. An empty stub is safe
 * because a codec initialises lazily: a path that does not encode or decode never touches it.
 *
 * **The limit, invisible otherwise:** a test that does transcode will not fail honestly, it will
 * fail inside a codec initialised from nothing. That path needs a real Worker runtime.
 */
export default defineConfig({
	plugins: [
		{
			name: 'stub-wasm',
			// Ahead of Vite's own resolver, which otherwise hands the bytes to the JS loader and
			// fails while reading them as source.
			enforce: 'pre' as const,
			resolveId(id) {
				return id.endsWith('.wasm') ? '\0stub-wasm' : null;
			},
			load(id) {
				return id === '\0stub-wasm' ? 'export default {};' : null;
			},
		},
	],
	/**
	 * Two suites, because a component needs a DOM and nothing else here does.
	 *
	 * Split by filename rather than by directory, so a new test lands in the right one by what it
	 * is named -- and the node suite stays at node's speed instead of 58 files paying for jsdom.
	 */
	test: {
		projects: [
			{
				test: {
					name: 'node',
					include: ['{apps,libs}/**/*.test.ts'],
					exclude: ['**/node_modules/**', '**/*.svelte.test.ts'],
				},
			},
			{
				/**
				 * Rebuilt from the site's config rather than extended from it: SvelteKit's plugin
				 * overrides `root` back to the working directory, so a project rooted at the
				 * workspace goes looking for `src/app.html` and `.inlang` here. Neither plugin is
				 * optional -- `stylex.create` throws at runtime, and `$lib` is SvelteKit's.
				 */
				extends: false,
				root: SITE,
				plugins: [
					svelte(),
					{
						// `enforce: undefined` for the reason the site's own config states it: ahead of
						// Svelte, StyleX is handed raw `.svelte` source and its Babel parser stops at
						// the first piece of markup. See apps/site/vite.config.ts.
						...stylex({
							useCSSLayers: true,
							aliases: { '$lib/*': ['/ROOT/src/lib/*'] },
							unstable_moduleResolution: { type: 'commonJS', rootDir: SITE },
						}),
						enforce: undefined,
						// Dropped because a test run is not a dev server: the hook opens a 150ms interval
						// polling for CSS updates and unregisters it on `httpServer.close`, which
						// vitest's middleware-mode server does not have. Nothing it installs is read.
						configureServer: undefined,
					},
				],
				resolve: {
					alias: { $lib: `${SITE}src/lib` },
					// Svelte publishes a server build that throws from `mount`, and it is what a test
					// file resolves to by default -- the suite is jsdom, so ask for the other one.
					conditions: ['browser'],
				},
				test: {
					name: 'component',
					environment: 'jsdom',
					include: ['src/**/*.svelte.test.ts'],
				},
			},
		],
	},
});

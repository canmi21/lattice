import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

const SITE = fileURLToPath(new URL('./apps/site/', import.meta.url));

/**
 * The one thing the default configuration cannot resolve.
 *
 * `apps/cdn` imports its codecs' `.wasm` files directly, because wrangler substitutes a compiled
 * `WebAssembly.Module` for each import at bundle time. Node has no such substitution, so any test
 * that reaches one of those modules fails to load before a single assertion runs -- which left the
 * route module untestable and its behaviour unheld.
 *
 * The stub is an empty object, and that is safe for exactly the reason it is narrow: a codec is
 * initialised lazily, on the first call that needs it, so a path that does not encode or decode
 * never touches what this replaces.
 *
 * **The limit, stated because it is invisible otherwise:** a test that does exercise a transcode
 * will not fail honestly here -- it will fail inside a codec initialised from nothing. Testing
 * that path needs a real Worker runtime (`@cloudflare/vitest-pool-workers`), not a wider stub.
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
	 * The split is by filename rather than by directory: `*.svelte.test.ts` mounts a component,
	 * `*.test.ts` does not, so each project's glob states its own requirement and a new test lands
	 * in the right one by what it is named. Keeping them apart is what leaves the node suite at
	 * node's speed -- a jsdom environment for all of it would be paid by 58 files to serve one.
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
				 * Rebuilt from the site's config rather than extended from it.
				 *
				 * `extends` was the intent, and SvelteKit's plugin makes it unreachable: it
				 * overrides `root` back to the working directory, and a project rooted at the
				 * workspace goes looking for `src/app.html` and `.inlang` here. What the component
				 * actually needs is two of those plugins, so they are stated instead.
				 *
				 * Neither is optional. `stylex.create` throws when it reaches the runtime -- the
				 * component calls it in `<script module>`, so without the compiler the import
				 * fails before a test runs. `$lib` is SvelteKit's, and is restated for the same
				 * reason SvelteKit is absent.
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
						// Dropped because a test run is not a dev server, and StyleX's is what keeps
						// the process alive: the hook opens a 150ms interval polling for CSS updates
						// and unregisters it on `httpServer.close`, which vitest's middleware-mode
						// server does not have. Nothing it installs -- that interval, the dev CSS
						// middleware -- has a reader here.
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

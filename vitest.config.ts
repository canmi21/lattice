import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin/vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

const SITE = fileURLToPath(new URL('./apps/site/', import.meta.url));
const CONSOLE = fileURLToPath(new URL('./apps/console/', import.meta.url));
const PROSE = fileURLToPath(new URL('./libs/prose/src/', import.meta.url));
const ROOT = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig({
	/**
	 * Two suites, because a component needs a DOM and nothing else here does.
	 *
	 * Split by filename rather than by directory, so a new test lands in the right one by what it
	 * is named -- and the node suite stays at node's speed instead of 58 files paying for jsdom.
	 */
	test: {
		// Before any suite, because that is the moment a parentless workerd is unambiguously from
		// a run that is over -- this one has not spawned one yet. An interrupted run is the half
		// of the leak the site's build hook does not reach; see the script for the other.
		globalSetup: ['./apps/site/scripts/reap-workerd.ts'],
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
							unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
						}),
						enforce: undefined,
						// Dropped because a test run is not a dev server: the hook opens a 150ms interval
						// polling for CSS updates and unregisters it on `httpServer.close`, which
						// vitest's middleware-mode server does not have. Nothing it installs is read.
						configureServer: undefined,
					},
				],
				resolve: {
					// The renderer is aliased to its source for the reason apps/site/vite.config.ts gives:
					// resolved through `node_modules` it would be compiled as a legacy component.
					alias: { '@canmi/prose': PROSE.replace(/\/$/, '') },
					// Svelte publishes a server build that throws from `mount`, and it is what a test
					// file resolves to by default -- the suite is jsdom, so ask for the other one.
					conditions: ['browser'],
				},
				test: {
					name: 'component',
					environment: 'jsdom',
					include: ['src/**/*.svelte.test.ts', '../../libs/prose/src/**/*.svelte.test.ts'],
				},
			},
			{
				/**
				 * The console's components, rendered on the server as its pages are, so Svelte's server
				 * build and no DOM. Svelte's plugin rather than SvelteKit's, which would start the
				 * adapter's emulated Worker for every run; the StyleX options are its vite.config.ts's.
				 */
				extends: false,
				root: CONSOLE,
				plugins: [
					svelte({ preprocess: vitePreprocess(), compilerOptions: { runes: true } }),
					{
						...stylex({
							useCSSLayers: true,
							unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
						}),
						enforce: undefined,
						// A test run is not a dev server, as above: nothing the hook installs is read.
						configureServer: undefined,
					},
				],
				test: { name: 'console', include: ['src/**/*.svelte.test.ts'] },
			},
		],
	},
});

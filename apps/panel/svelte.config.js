import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * A Node server of its own: pages rendered on the server with what host answers, the live parts
 * drawn in the browser, and `/api` and `/notice` passed on to host, which nothing else reaches. See
 * spec/architecture/host.md, "The panel is an app of its own".
 */
/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ precompress: false }),
	},
};

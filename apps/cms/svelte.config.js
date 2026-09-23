import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
	},
	kit: {
		// A single page with client-side routing, because every route here reads `local` and
		// nothing here is public: there is no crawler to render for and no cache to fill. It is
		// also the shape `local` can serve itself once this stops being a dev server.
		adapter: adapter({ fallback: 'index.html' }),
		appDir: '_',
		alias: {
			// The same alias the site states, for the same two reasons: `svelte-check` types what
			// the project contains, and the runes rule above turns runes off under `node_modules`.
			'@canmi/prose': '../../libs/prose/src',
		},
	},
};

export default config;

import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Exported as static files: every page with a fixed address prerendered as a shell, and `200.html`
 * for the rest, which host answers a path with when no file of its own does. Nothing renders on a
 * server. See spec/architecture/host.md, "The panel is host's own".
 */
/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ fallback: '200.html' }),
	},
};

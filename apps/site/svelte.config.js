import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
	},
	kit: {
		adapter: adapter(),
		appDir: '_',
		files: {
			assets: 'public',
		},
		alias: {
			// The article renderer is a package and is still aliased to its source. Two reasons, and
			// the second is the one that bites: `svelte-check` types what the project contains, and
			// the runes rule above turns runes off for anything under `node_modules` -- which is
			// where a workspace package resolves through. These are runes components.
			'@canmi/prose': '../../libs/prose/src',
			// Articles live at the repository root, not inside this app, because they are
			// written and revised rather than compiled -- see spec/architecture/workspace.md. An alias
			// rather than a relative path, so moving a source file cannot silently change how
			// many `../` are needed.
			$contents: '../../contents',
		},
	},
};

export default config;

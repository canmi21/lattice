import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { PORT_OFFSET } from 'canmi/urls';
import { PANEL_PORT } from '@monoflake/urls';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The workspace root, matching the site and the editor: StyleX hashes a class from the file's path
// relative to this.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: { runes: true },
			adapter: adapter({ precompress: false }),
			// `#lib` for svelte-check, as the site's config says.
			alias: { '#lib': 'src/lib' },
		}),

		{
			// After the Svelte compiler, not before it; see spec/architecture/css/layers.md, "The build
			// order is the opposite of what StyleX documents".
			...stylex({
				useCSSLayers: true,
				aliases: { '#lib/*': ['/ROOT/apps/panel/src/lib/*'] },
				unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
				lightningcssOptions: { minify: true },
			}),
			enforce: undefined,
		},
	],
	server: {
		port: PANEL_PORT + PORT_OFFSET,
		strictPort: true,
	},
});

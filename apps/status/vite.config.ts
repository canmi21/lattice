import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The workspace root, as the site and the panel set it: StyleX hashes a class from the file's path
// relative to this, and reads `libs/tokens` from under it.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		{
			// This app's own StyleX build, after the Svelte compiler rather than before it; see
			// spec/architecture/css/layers.md, "The build order is the opposite of what StyleX
			// documents", and "Every app compiles its own StyleX".
			...stylex({
				useCSSLayers: true,
				aliases: { '$lib/*': ['/ROOT/apps/status/src/lib/*'] },
				unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
				lightningcssOptions: { minify: true },
			}),
			enforce: undefined,
		},
	],
	// Hashed file names in hex, as the site's are.
	build: { rollupOptions: { output: { hashCharacters: 'hex' } } },
});

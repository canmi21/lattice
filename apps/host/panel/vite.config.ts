import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_PORTS, URLS } from '@canmi/urls';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The workspace root, matching the site and the editor: StyleX hashes a class from the file's path
// relative to this.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// The host the panel asks. The machine's own by default, which node from mise may be refused on
// macOS; `PANEL_API=http://localhost:11011` asks a host running here instead. See
// spec/architecture/host.md, "The panel is host's own".
const API = process.env.PANEL_API || URLS.internal.home;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		{
			// After the Svelte compiler, not before it; see spec/architecture/css/layers.md, "The build
			// order is the opposite of what StyleX documents".
			...stylex({
				useCSSLayers: true,
				aliases: { '$lib/*': ['/ROOT/apps/host/panel/src/lib/*'] },
				unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
				lightningcssOptions: { minify: true },
			}),
			enforce: undefined,
		},
	],
	server: {
		port: DEVELOPMENT_PORTS.panel,
		strictPort: true,
		// The panel has no host of its own in development: it asks a real one.
		proxy: { '/api': { target: API, changeOrigin: true, secure: true } },
	},
});

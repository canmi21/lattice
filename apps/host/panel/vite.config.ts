import { DEVELOPMENT_PORTS, URLS } from '@canmi/urls';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Laid out as SvelteKit lays out its output, every file under `_app/immutable/` and named by its
 * hash alone, so host can serve that whole prefix for a year. See spec/architecture/host.md, "The
 * panel is host's own".
 */
const IMMUTABLE = '_app/immutable';

export default defineConfig({
	plugins: [tailwindcss(), svelte()],
	build: {
		rollupOptions: {
			output: {
				hashCharacters: 'hex',
				entryFileNames: `${IMMUTABLE}/entry/[hash:16].js`,
				chunkFileNames: `${IMMUTABLE}/chunks/[hash:16].js`,
				assetFileNames: `${IMMUTABLE}/assets/[hash:16][extname]`,
			},
		},
	},
	server: {
		port: DEVELOPMENT_PORTS.panel,
		strictPort: true,
		// The panel has no host of its own in development: it asks the real one, on the LAN.
		proxy: Object.fromEntries(
			['/apps', '/routes', '/caddy', '/session', '/health'].map((prefix) => [
				prefix,
				{ target: URLS.internal.home, changeOrigin: true, secure: true },
			]),
		),
	},
});

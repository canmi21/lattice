import { DEVELOPMENT_PORTS, URLS } from '@canmi/urls';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: DEVELOPMENT_PORTS.panel,
		strictPort: true,
		// The panel has no host of its own in development: it asks the real one, on the LAN.
		proxy: { '/api': { target: URLS.internal.home, changeOrigin: true, secure: true } },
	},
});

import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_PROXY_PATHS, developmentUrl } from '@canmi/urls';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The workspace root, matching the site: StyleX hashes a class from the file's path relative to
// this, and the visual layer is written in `libs/` as well as in an application.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Where `local` answers. Read from the environment rather than restated, because the Rust half
// binds the same number -- see spec/toolchain.md, "Dev ports are pinned".
const LOCAL = `http://localhost:${process.env.LOCAL_PORT ?? 26521}`;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		{
			...stylex({
				useCSSLayers: true,
				unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
				lightningcssOptions: { minify: true },
			}),
			enforce: undefined,
		},
	],
	server: {
		host: '::',
		port: 26518,
		// Never another number: a second copy of this would be a second editor writing one
		// collection. See spec/toolchain.md, "Dev ports are pinned".
		strictPort: true,
		// Both prefixes are forwarded rather than called across origins, so the browser only ever
		// talks to itself: no CORS, and no second address in the client. `/cdn` is the site's own
		// arrangement -- a draft's pictures were never published, so only the local CDN answers
		// for them. See spec/architecture/local.md and spec/architecture/workspace.md.
		proxy: {
			'/collection': { target: LOCAL, changeOrigin: false },
			[DEVELOPMENT_PROXY_PATHS.cdn]: {
				target: developmentUrl('cdn'),
				changeOrigin: true,
				rewrite: (path: string) => path.slice(DEVELOPMENT_PROXY_PATHS.cdn.length),
			},
		},
	},
	build: { target: 'es2023' },
});

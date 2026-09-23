import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// The workspace root, matching the site: StyleX hashes a class from the file's path relative to
// this, and the visual layer is written in `libs/` as well as in an application.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Where `local` answers. Read from the environment rather than restated, because the Rust half
// binds the same number -- see spec/toolchain.md, "Dev ports are pinned".
const LOCAL = `http://localhost:${process.env.LOCAL_PORT ?? 26521}`;

export default defineConfig({
	plugins: [
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
		// `/collection` is forwarded rather than called across origins. The browser then makes
		// same-origin requests, so there is no CORS to configure and no second address in the
		// client's code -- the prefix is the one `local` already owns. See architecture/local.md.
		proxy: { '/collection': { target: LOCAL, changeOrigin: false } },
	},
	build: { target: 'es2023' },
});

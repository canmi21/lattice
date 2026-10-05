import netlify from '@sveltejs/adapter-netlify';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { esbuildTarget } from '@canmi/web/compat/build';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The workspace root, as the site and the status page set it: StyleX hashes a class from the
// file's path relative to this.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// `browserslist` in package.json is the syntax floor, the site's exactly; see spec/compat.md.
const BROWSERSLIST: string[] = JSON.parse(
	readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).browserslist;

/**
 * Netlify's adapter, rendering on its Edge Functions: every request is rendered and the rest is
 * `Cache-Control`'s, as on the site. See spec/todo/site.md, "The service domains answer nothing of
 * their own yet".
 */
const adapter = netlify({ edge: true });

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: { runes: true },
			adapter,
			// `#lib` for svelte-check, as the site's config says.
			alias: { '#lib': 'src/lib' },
		}),
		{
			// This app's own StyleX build, after the Svelte compiler rather than before it; see
			// spec/architecture/css/layers.md, "Every app compiles its own StyleX".
			...stylex({
				useCSSLayers: true,
				aliases: { '#lib/*': ['/ROOT/apps/landing/src/lib/*'] },
				unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
				lightningcssOptions: { minify: true },
			}),
			enforce: undefined,
		},
	],
	// Pinned, and every name below `.localhost` reaches it: `ixc.one.localhost` is how a host is
	// asked for here. See spec/toolchain.md, "Dev ports are pinned".
	server: { host: '::', port: 26525, strictPort: true, allowedHosts: ['.localhost'] },
	// Hashed file names in hex, as the site's are.
	build: {
		target: esbuildTarget(BROWSERSLIST),
		rollupOptions: { output: { hashCharacters: 'hex' } },
	},
});

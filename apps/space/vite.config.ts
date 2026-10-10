import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { pickUrls } from '@monoflake/sdk';
import { buildDefine } from '@canmi/web/build';

// The repository root, as the site and the console set it: StyleX hashes a class from the file's
// path relative to this.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const stylexPlugin = stylex({
	useCSSLayers: true,
	unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
	lightningcssOptions: { minify: true },
});

export default defineConfig(({ mode }) => ({
	// The commit, the build moment and the disclosure; see lib's spec/web/build.md.
	define: buildDefine(fileURLToPath(new URL('.', import.meta.url))),
	// Its own pinned port, refused rather than moved when taken; see spec/toolchain.md, "Dev ports
	// are pinned".
	server: { port: 26528, strictPort: true },
	plugins: [
		{
			// The font stylesheets in @canmi/fonts name their host by a placeholder, which mode
			// decides: the CDN, or the local gateway in development.
			name: 'replace-cdn-url',
			transform(code: string, id: string) {
				if (!/\.css($|\?)/.test(id) || !code.includes('__CDN_URL__')) return null;
				return code.replaceAll('__CDN_URL__', pickUrls(mode !== 'production').cdn);
			},
		},
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: { runes: true },
			// Rendered in the Worker, a page prerendered where it says so; see
			// spec/architecture/space.md, "Rendered on request, prerendered by choice".
			adapter: adapter(),
		}),
		{
			// After the Svelte compiler, not before it; see spec/architecture/css/layers.md, "The build
			// order is the opposite of what StyleX documents".
			...stylexPlugin,
			enforce: undefined,
			// SvelteKit owns the HTML shell; +layout.svelte injects these two dev assets itself.
			transformIndexHtml: undefined,
		},
	],
	build: {
		target: 'es2023',
		rollupOptions: { output: { hashCharacters: 'hex' } },
	},
}));

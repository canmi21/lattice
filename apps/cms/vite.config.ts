import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_PROXY_PATHS, developmentUrl, pageUrls, PORT_OFFSET } from '@canmi/urls';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { LOCAL_ORIGIN } from './src/lib/local.ts';

// The workspace root, matching the site: StyleX hashes a class from the file's path relative to
// this, and the visual layer is written in `libs/` as well as in an application.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		{
			// The font stylesheets carry a placeholder for the CDN, as the site's config explains;
			// this is a development server, so it is the proxied path. See apps/site/vite.config.ts.
			name: 'replace-cdn-url',
			transform(code: string, id: string) {
				if (/\.css($|\?)/.test(id) && code.includes('__CDN_URL__')) {
					return code.replaceAll('__CDN_URL__', pageUrls(true).cdn);
				}
				return null;
			},
		},
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
		// Shifted in the sandbox, and never otherwise another number: a second copy of this would
		// be a second editor writing one collection. See spec/toolchain.md, "Dev ports are pinned",
		// and spec/architecture/modes.md.
		port: 26518 + PORT_OFFSET,
		strictPort: true,
		// Both prefixes are forwarded rather than called across origins, so the browser only ever
		// talks to itself: no CORS, and no second address in the client. `/cdn` is the site's own
		// arrangement -- a draft's pictures were never published, so only the local CDN answers
		// for them. See spec/architecture/local.md and spec/architecture/workspace.md.
		proxy: {
			'/collection': { target: LOCAL_ORIGIN, changeOrigin: false },
			[DEVELOPMENT_PROXY_PATHS.cdn]: {
				target: developmentUrl('cdn'),
				changeOrigin: true,
				rewrite: (path: string) => path.slice(DEVELOPMENT_PROXY_PATHS.cdn.length),
			},
		},
	},
	build: { target: 'es2023' },
	// The page has no environment to read the sandbox's shift from; this editor only ever runs as
	// a development server.
	define: { STATED_PORT_OFFSET: PORT_OFFSET },
});

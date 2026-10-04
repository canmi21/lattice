import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	DEVELOPMENT_PORTS,
	DEVELOPMENT_PROXY_PATHS,
	pageUrls,
	PORT_OFFSET,
	URLS,
} from '@monoflake/sdk';
import { esbuildTarget } from '@canmi/web/compat/build';
import { pluginOptions, sourcemapSetting, uploadsSourceMaps } from '@canmi/web/sentry/build';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import Icons from 'unplugin-icons/vite';
import { execFileSync } from 'node:child_process';
import { defineConfig, type UserConfig } from 'vite';
import { addresses } from '@canmi/site-api/contracts';
import { author } from 'canmi/identity';
import { parse as parseYaml } from 'yaml';
import { reap } from './scripts/reap-workerd.ts';

// The workspace root, because the visual layer is now written in two trees: this application and
// the packages under `libs/`. StyleX hashes a class from the file's path relative to this.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE_CONFIG = fileURLToPath(new URL('./site.config.yaml', import.meta.url));
const LICENSES = fileURLToPath(new URL('../../data/build/licenses.json', import.meta.url));

// Built-in 301s, kept out of site.config.yaml because they are product behaviour rather than
// configuration: feed aliases and the favicon redirect to the CDN.
function builtinRedirects(cdnUrl: string): Record<string, string> {
	return {
		'/rss': '/atom.xml',
		'/rss.xml': '/atom.xml',
		'/feed': '/atom.xml',
		'/feed.xml': '/atom.xml',
		'/favicon.ico': `${cdnUrl}/favicon.ico`,
	};
}

// TODO: nothing reads this yet. It is kept, not deleted, because the footer that shows the
// deployed commit is planned rather than abandoned -- and the value has to be captured at build
// time, which is a thing this file can do and a component cannot.
//
// execFileSync takes no shell, so there is no injection surface. jj is colocated with git, which
// is why asking git still works.
const commitHash = (() => {
	try {
		return execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
	} catch {
		return 'unknown';
	}
})();

// Sitemap <lastmod> for routes like "/" that have no article of their own to date from.
const buildTime = new Date().toISOString();

// `browserslist` in package.json is the syntax floor; see spec/compat.md, "The syntax floor is
// set to the same line, deliberately".
const BROWSERSLIST: string[] = JSON.parse(
	readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).browserslist;

export default defineConfig(({ mode }) => {
	// The page-facing map, because both readers of it below end up in a document: the redirect
	// targets a browser follows, and the font stylesheet's `__CDN_URL__`. In development those
	// must be the proxied paths, or a page opened from another device asks that device for its
	// own fonts. See libs/urls.
	const urls = pageUrls(mode !== 'production');
	// Asked once. It can throw, and a predicate that throws should do so at a point in the build
	// somebody can place, rather than from inside a plugin's option list. In CI a missing
	// credential is fatal instead of skipped: that build is deployed, and a silent skip would
	// minify every stack trace it produces.
	const uploadSourceMaps = uploadsSourceMaps(process.env, { requireTokenInCi: true });
	return {
		plugins: [
			{
				// The adapter leaks one workerd per build, and the last build's is parentless by
				// now -- which is the only moment it can be told from a dev server's. Build only:
				// `vite dev` never runs the adapter. See scripts/reap-workerd.ts.
				name: 'reap-workerd',
				apply: 'build' as const,
				buildStart() {
					reap();
				},
			},
			tailwindcss(),
			// One strategy, no built-in fallback: locale negotiation stays in the worker and
			// Paraglide is told the answer. `url` is deliberately absent -- a locale never appears
			// in a path here, so there is nothing to delocalize and no `reroute` hook.
			// See spec/locale/addressing.md.
			paraglideVitePlugin({
				// The SDK refuses any project path not ending in `.inlang`, so the whole name is
				// the suffix. See spec/locale/interface.md. Both live in `libs/messages` because
				// the article components import the output and a library cannot reach `$lib`.
				project: '../../libs/messages/.inlang',
				outdir: '../../libs/messages/src',
				strategy: ['custom-negotiated'],
			}),
			// Iconify sets compiled to Svelte components at build time, so a set contributes only
			// the icons actually imported rather than a runtime font or sprite sheet.
			Icons({ compiler: 'svelte' }),
			// The deployed worker carries no maps: they are deleted after the upload.
			sentrySvelteKit(
				pluginOptions({
					project: 'canmi',
					upload: uploadSourceMaps,
					env: process.env,
					mapsToDelete: ['.svelte-kit/cloudflare/**/*.map'],
				}),
			),

			sveltekit({
				preprocess: vitePreprocess(),
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				},
				adapter: adapter(),
				appDir: '_',
				files: { assets: 'public' },
				alias: {
					// `#lib` is package.json's subpath import, which Vite and TypeScript read on their own;
					// stated here too only so the generated `paths` carry it, since svelte-check 4.7 finds
					// a `.svelte` file through `paths` and not through `imports`. Drop it once it does.
					'#lib': 'src/lib',

					// The article renderer is a package and is still aliased to its source. Two reasons, and
					// the second is the one that bites: `svelte-check` types what the project contains, and
					// the runes rule above turns runes off for anything under `node_modules` -- which is
					// where a workspace package resolves through. These are runes components.
					'@canmi/prose': '../../libs/prose/src',

					// Articles live at the repository root, not inside this app, because they are
					// written and revised rather than compiled -- see
					// spec/architecture/workspace.md. An alias rather than a relative path, so moving a
					// source file cannot silently change how many `../` are needed.
					$contents: '../../contents',
				},
			}),

			{
				// The visual layer, appended after Tailwind's so its cascade layers land above
				// Tailwind's utilities and below Svelte's scoped rules -- see
				// spec/architecture/css/layers.md, "The build order is the opposite of what StyleX
				// documents", for why `enforce: undefined` is load-bearing and why the module resolution
				// below is stated rather than defaulted.
				...stylex({
					useCSSLayers: true,
					aliases: { '#lib/*': ['/ROOT/src/lib/*'] },
					unstable_moduleResolution: { type: 'commonJS', rootDir: ROOT },
					// Appending after Tailwind's CSS also means appending after Vite has minified
					// it, so this layer used to ship its newlines while everything above it had
					// none. The plugin already runs Lightning CSS over its own sheet before it
					// appends; this is that pass being asked to compress as well, which is the
					// one place to do it that leaves the order above untouched.
					lightningcssOptions: { minify: true },
				}),
				enforce: undefined,
			},
			{
				// The merged redirect map, baked into a virtual module. The [...path] route emits
				// redirect() responses that each adapter translates to its own format, so none of
				// this is tied to Cloudflare. It reaches the browser too, since that route's load
				// is universal: four legacy paths are cheaper to ship than a click that 404s.
				name: 'virtual-redirects',
				resolveId(id: string) {
					return id === 'virtual:redirects' ? '\0virtual:redirects' : null;
				},
				load(id: string) {
					if (id !== '\0virtual:redirects') return null;
					this.addWatchFile(SITE_CONFIG);
					const { redirects = {} } = parseYaml(readFileSync(SITE_CONFIG, 'utf8')) as {
						redirects?: Record<string, string>;
					};
					const map = { ...builtinRedirects(urls.cdn), ...redirects };
					return `export const redirects = ${JSON.stringify(map)};`;
				},
			},
			{
				// The font stylesheets in @canmi/fonts carry a placeholder rather than a
				// host, because which CDN answers depends on the mode and a library cannot
				// know that. See spec/architecture/workspace.md on where URLs are declared.
				name: 'replace-cdn-url',
				transform(code: string, id: string) {
					if (/\.css($|\?)/.test(id) && code.includes('__CDN_URL__')) {
						return code.replaceAll('__CDN_URL__', urls.cdn);
					}
					return null;
				},
			},
			// TODO: this record and the surface it feeds are both going. It is held out of the
			// move of generated records into R2 on purpose, so the eight licence addresses can
			// be collapsed first and the record follow whatever they become.
			// See spec/todo/site.md, "The licence surface is eight addresses and one baked record".
			{
				// The dependency licence record, baked in. Only the metadata travels: the texts
				// themselves are published objects the CDN serves, so the Worker carries a few
				// hundred KB of names and ids rather than several megabytes of legal prose.
				name: 'virtual-licenses',
				resolveId(id: string) {
					return id === 'virtual:licenses' ? '\0virtual:licenses' : null;
				},
				load(id: string) {
					if (id !== '\0virtual:licenses') return null;
					this.addWatchFile(LICENSES);
					return `export const licenses = ${readFileSync(LICENSES, 'utf8')};`;
				},
			},
			{
				// site.config.yaml baked into the bundle, which keeps the YAML parser out of
				// the client and the file out of the deployed worker. The author is
				// canmi/identity's; see spec/architecture/identity.md.
				name: 'virtual-site-config',
				resolveId(id: string) {
					return id === 'virtual:site' ? '\0virtual:site' : null;
				},
				load(id: string) {
					if (id !== '\0virtual:site') return null;
					this.addWatchFile(SITE_CONFIG);
					const { redirects: _redirects, ...data } = parseYaml(readFileSync(SITE_CONFIG, 'utf8'));
					return `export const site = ${JSON.stringify({ ...data, author })};`;
				},
			},
		],
		server: {
			// Pinned, never auto-incremented; see spec/toolchain.md. The number itself lives in
			// the URL map, so moving the dev server stays a one-file edit.
			port: DEVELOPMENT_PORTS.site,
			strictPort: true,
			// Every interface, so a phone on the same network can open this. `::` rather than
			// `0.0.0.0` because Node leaves IPV6_V6ONLY off, so one value covers both stacks and
			// the loopback addresses inside them -- `0.0.0.0` alone would drop `[::1]`, which is
			// what `localhost` resolves to first on this machine.
			host: '::',
			// The other two workers, reached through this one. The prefix is stripped on the way
			// out, so each worker sees only the paths it actually serves. Both the prefix and the
			// target come from libs/sdk, the one place every address here is declared and where
			// the reasoning lives for why development collapses three origins into one. The target
			// is the same map anything else uses to reach these workers, not a resolver of its own.
			proxy: Object.fromEntries(
				Object.entries(DEVELOPMENT_PROXY_PATHS).map(([app, prefix]) => [
					prefix,
					{
						target: URLS.apps.development[app as keyof typeof DEVELOPMENT_PROXY_PATHS],
						changeOrigin: true,
						rewrite: (path: string) => path.slice(prefix.length),
					},
				]),
			),
		},
		ssr: {
			// Bits UI publishes Svelte source. Leaving it external in dev hands its `.svelte`
			// imports to Node through Sentry's loader, which cannot transform them and turns every
			// article request into an otherwise silent 500. Production bundles it already; make the
			// development SSR path cross the same compilation boundary.
			noExternal: ['bits-ui', '@inlang/paraglide-js-svelte', '@canmi/prose'],
		},
		build: {
			// Stated rather than left to Vite's default, which is a baseline of its own choosing
			// and can move under a major. See BROWSERSLIST above.
			target: esbuildTarget(BROWSERSLIST),
			sourcemap: sourcemapSetting(uploadSourceMaps),
			rollupOptions: {
				output: {
					hashCharacters: 'hex',
				},
			},
		},
		// URLs are imported from @monoflake/sdk at their use sites rather than injected here, so
		// there is one spelling of each. What is left is the pair of values that genuinely
		// only exist at build time.
		define: {
			'import.meta.env.VITE_COMMIT_HASH': JSON.stringify(commitHash),
			'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
			// A page has no environment to read the sandbox's shift from. Development only: a
			// production build states nothing and reads 0. See spec/architecture/modes.md.
			...(mode === 'production' ? {} : { STATED_PORT_OFFSET: PORT_OFFSET }),
			// The addresses of the API's routes, stated to the pages and the Worker by one build, so
			// the two agree by construction. Production only: development asks by name. See
			// spec/architecture/services.md, "The pages ask by contract, not by name".
			...(mode === 'production' ? { STATED_API_ADDRESSES: JSON.stringify(addresses()) } : {}),
		},
	} satisfies UserConfig;
});

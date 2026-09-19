import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_PORTS, DEVELOPMENT_PROXY_PATHS, developmentUrl, pageUrls } from '@canmi/urls';
import { sentrySvelteKit } from '@sentry/sveltekit';
import stylex from '@stylexjs/unplugin/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import Icons from 'unplugin-icons/vite';
import { execFileSync } from 'node:child_process';
import { defineConfig, type UserConfig } from 'vite';
import { parse as parseYaml } from 'yaml';

const SITE = fileURLToPath(new URL('.', import.meta.url));
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

// The syntax floor, and the only place it is written down. `browserslist` in package.json says
// which browsers the emitted JavaScript has to parse on, esbuild compiles down to it here, and
// it deliberately matches the compatibility canary's line -- see spec/compat.md, "The syntax
// floor is set to the same line, deliberately".
const BROWSERSLIST: string[] = JSON.parse(
	readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).browserslist;

// esbuild wants `chrome110`; browserslist writes `chrome >= 110`. Same fact, two spellings,
// and this is the whole distance between them.
const esbuildTarget = BROWSERSLIST.map((query) => {
	const floor = /^(\S+)\s*>=\s*(\S+)$/.exec(query);
	if (!floor)
		throw new Error(`browserslist entry is not a floor, so esbuild cannot take it: ${query}`);
	return `${floor[1]}${floor[2]}`;
});

/**
 * Whether this build sends its source maps to Sentry.
 *
 * Why the skip lives in `mise.toml` and drives `autoUploadSourceMaps` rather than merely
 * withholding the credential -- see spec/architecture/data.md, "A CI build compiles the site,
 * and no longer compiles the corpus". In CI a missing credential is fatal instead of silently
 * skipped: that build is deployed, and a silent skip would minify every stack trace it produces.
 */
function uploadsSourceMaps(): boolean {
	// Any non-empty value enables it, so `SENTRY_SKIP_UPLOAD= pnpm run build` is how one local
	// build uploads after all. A value of `0` or `false` still skips: this is a switch, and
	// reading words out of it would only invite the belief that it parses them.
	if (process.env.SENTRY_SKIP_UPLOAD) return false;

	const token = process.env.SENTRY_AUTH_TOKEN;
	if (!token && process.env.CI) {
		throw new Error(
			'SENTRY_AUTH_TOKEN is unset in CI. Add it as an encrypted build variable, or the ' +
				'deployed worker will report every error without a usable stack trace.',
		);
	}
	return Boolean(token);
}

export default defineConfig(({ mode }) => {
	// The page-facing map, because both readers of it below end up in a document: the redirect
	// targets a browser follows, and the font stylesheet's `__CDN_URL__`. In development those
	// must be the proxied paths, or a page opened from another device asks that device for its
	// own fonts. See libs/urls.
	const urls = pageUrls(mode !== 'production');
	// Asked once. It can throw, and a predicate that throws should do so at a point in the build
	// somebody can place, rather than from inside a plugin's option list.
	const uploadSourceMaps = uploadsSourceMaps();
	return {
		plugins: [
			tailwindcss(),
			// One strategy, no built-in fallback: locale negotiation stays in the worker and
			// Paraglide is told the answer. `url` is deliberately absent -- a locale never appears
			// in a path here, so there is nothing to delocalize and no `reroute` hook.
			// See spec/locale/addressing.md.
			paraglideVitePlugin({
				// The SDK refuses any project path not ending in `.inlang`, so the whole name is
				// the suffix. See spec/locale/interface.md.
				project: './.inlang',
				outdir: './src/lib/paraglide',
				strategy: ['custom-negotiated'],
			}),
			// Iconify sets compiled to Svelte components at build time, so a set contributes only
			// the icons actually imported rather than a runtime font or sprite sheet.
			Icons({ compiler: 'svelte' }),
			sentrySvelteKit({
				org: 'canmi',
				project: 'canmi',
				autoUploadSourceMaps: uploadSourceMaps,
				authToken: uploadSourceMaps ? process.env.SENTRY_AUTH_TOKEN : undefined,
				telemetry: false,
				// Maps are uploaded to Sentry and then deleted, so the deployed worker carries
				// none. Paired with `sourcemap: 'hidden'` below, which emits them without the
				// `sourceMappingURL` comment, nothing in the browser goes looking for a file
				// that is not there. A build that does not upload emits none at all, so this
				// list has nothing to match and nothing is left behind either way.
				sourcemaps: {
					filesToDeleteAfterUpload: ['.svelte-kit/cloudflare/**/*.map'],
				},
			}),
			sveltekit(),
			{
				// The visual layer, appended after Tailwind's so its cascade layers land above
				// Tailwind's utilities and below Svelte's scoped rules -- see
				// spec/architecture/css/layers.md, "The build order is the opposite of what StyleX
				// documents", for why `enforce: undefined` is load-bearing and why the module resolution
				// below is stated rather than defaulted.
				...stylex({
					useCSSLayers: true,
					aliases: { '$lib/*': ['/ROOT/src/lib/*'] },
					unstable_moduleResolution: { type: 'commonJS', rootDir: SITE },
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
			// See spec/todo.md, "The licence surface is eight addresses and one baked record".
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
				// the client and the file out of the deployed worker.
				name: 'virtual-site-config',
				resolveId(id: string) {
					return id === 'virtual:site' ? '\0virtual:site' : null;
				},
				load(id: string) {
					if (id !== '\0virtual:site') return null;
					this.addWatchFile(SITE_CONFIG);
					const { redirects: _redirects, ...data } = parseYaml(readFileSync(SITE_CONFIG, 'utf8'));
					return `export const site = ${JSON.stringify(data)};`;
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
			// target come from libs/urls, the one place every address here is declared and where
			// the reasoning lives for why development collapses three origins into one. The target
			// is the same function anything else uses to reach these two workers, not a resolver
			// of its own -- the hop never varied by the family a request arrived on.
			proxy: Object.fromEntries(
				Object.entries(DEVELOPMENT_PROXY_PATHS).map(([app, prefix]) => [
					prefix,
					{
						target: developmentUrl(app as 'api' | 'alias' | 'cdn'),
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
			noExternal: ['bits-ui', '@inlang/paraglide-js-svelte'],
		},
		build: {
			// Stated rather than left to Vite's default, which is a baseline of its own choosing
			// and can move under a major. See BROWSERSLIST above.
			target: esbuildTarget,
			// Only when they are going somewhere. `filesToDeleteAfterUpload` below cleans them up
			// after an upload and cannot clean up after a build that did not do one, so a build
			// that skips would otherwise leave 117 maps in the directory wrangler deploys -- the
			// site's own source, served as static assets. Not emitting them is the shorter answer
			// than emitting and sweeping, and on this machine they were never going to be read.
			sourcemap: uploadSourceMaps ? 'hidden' : false,
			rollupOptions: {
				output: {
					hashCharacters: 'hex',
				},
			},
		},
		// URLs are imported from @canmi/urls at their use sites rather than injected here, so
		// there is one spelling of each. What is left is the pair of values that genuinely
		// only exist at build time.
		define: {
			'import.meta.env.VITE_COMMIT_HASH': JSON.stringify(commitHash),
			'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
		},
	} satisfies UserConfig;
});

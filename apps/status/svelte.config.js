import cloudflare from '@sveltejs/adapter-cloudflare';
import vercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * One app, built for a door by `STATUS_TARGET`: the adapter and the base path, and nothing else.
 * Unset is Vercel's, the door that is the page's one address; anything unknown fails the build
 * rather than guessing. See spec/architecture/probe.md, "The page: one app, three doors".
 */
const DOORS = {
	// Stated, since the adapter otherwise takes the building Node's, and mise's is newer than
	// Vercel runs.
	vercel: { adapter: () => vercel({ runtime: 'nodejs24.x' }), base: '' },
	cloudflare: { adapter: () => cloudflare(), base: '/status' },
};

const target = process.env.STATUS_TARGET || 'vercel';
if (!Object.hasOwn(DOORS, target)) {
	throw new Error(`STATUS_TARGET must be one of ${Object.keys(DOORS).join(', ')}, not ${target}`);
}
const door = DOORS[/** @type {keyof typeof DOORS} */ (target)];

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: door.adapter(),
		paths: { base: door.base },
	},
};
